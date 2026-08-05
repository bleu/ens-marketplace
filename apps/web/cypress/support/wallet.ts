/// A minimal EIP-1193 provider that impersonates one of Anvil's default dev accounts,
/// injected into the page before load (see the connectAs custom command). It works
/// because Anvil's default accounts are "unlocked" — Anvil holds their private keys
/// itself and will sign+send on their behalf for any eth_sendTransaction naming one as
/// `from`, the same convenience Hardhat/Ganache dev nodes offer. That means this shim
/// never needs to sign anything itself: every method (including eth_sendTransaction) is
/// just forwarded as a raw JSON-RPC call straight to Anvil.
///
/// wagmi's own configured `transports` (viem's http() client) handle all *read* calls
/// directly against the RPC — this provider only needs to answer the small set of
/// wallet-specific methods a connector actually calls (accounts, chainId, chain
/// switching, sending/signing), so anything else is passed through too, for safety.
///
/// Announces itself via EIP-6963 (in addition to the legacy `window.ethereum` global) so
/// wagmi's `injected()` connector and RainbowKit's wallet list reliably pick it up,
/// matching how a real extension wallet like MetaMask announces itself.
export function installFakeWallet(win: Cypress.AUTWindow, address: string) {
  const RPC_URL = "http://127.0.0.1:8545";
  const CHAIN_ID_HEX = "0x7a69"; // 31337, Anvil's default chain id (foundry)

  function rpc(method: string, params: unknown[] = []) {
    return win
      .fetch(RPC_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }),
      })
      .then((res) => res.json())
      .then((json) => {
        if (json.error) throw new Error(json.error.message ?? "RPC error");
        return json.result;
      });
  }

  const listeners: Record<string, ((...args: unknown[]) => void)[]> = {};

  const provider = {
    isMetaMask: true,
    request({ method, params }: { method: string; params?: unknown[] }) {
      switch (method) {
        case "eth_requestAccounts":
        case "eth_accounts":
          return Promise.resolve([address]);
        case "eth_chainId":
          return Promise.resolve(CHAIN_ID_HEX);
        case "wallet_switchEthereumChain":
        case "wallet_addEthereumChain":
          // Only chain this test harness ever runs against — always already "switched".
          return Promise.resolve(null);
        case "eth_sendTransaction": {
          const tx = (params?.[0] ?? {}) as Record<string, unknown>;
          return rpc("eth_sendTransaction", [{ ...tx, from: tx.from ?? address }]);
        }
        default:
          return rpc(method, params);
      }
    },
    on(event: string, cb: (...args: unknown[]) => void) {
      (listeners[event] ??= []).push(cb);
    },
    removeListener(event: string, cb: (...args: unknown[]) => void) {
      listeners[event] = (listeners[event] ?? []).filter((fn) => fn !== cb);
    },
  };

  (win as unknown as { ethereum: typeof provider }).ethereum = provider;

  const announce = () => {
    win.dispatchEvent(
      new (win as unknown as { CustomEvent: typeof CustomEvent }).CustomEvent("eip6963:announceProvider", {
        detail: Object.freeze({
          info: {
            uuid: "cypress-fake-wallet",
            name: "MetaMask",
            icon: "data:image/svg+xml;base64,",
            rdns: "io.metamask",
          },
          provider,
        }),
      }),
    );
  };
  win.addEventListener("eip6963:requestProvider", announce);
  announce();
}
