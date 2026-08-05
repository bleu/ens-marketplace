"use client";

import { useCallback, useEffect, useState } from "react";
import { parseAbi } from "viem";
import { usePublicClient, useWatchContractEvent } from "wagmi";
import { sepolia } from "wagmi/chains";
import { getContractEventsChunked } from "./events";

/// Real ENS Labs ENSv2 alpha contracts on Sepolia — NOT our own mock, and NOT officially
/// published anywhere (ENS Labs has not listed these in docs.ens.domains or their public
/// `ensdomains/contracts-v2` deployments folder). Discovered by a user browsing the real
/// ENS App Alpha (sepolia.app.ens.domains) and confirmed here via bytecode/selector
/// cross-reference against `ensdomains/contracts-v2`'s committed ABIs (22/32 ETHRegistrar
/// selectors matched exactly) plus live on-chain calls (`ETH_REGISTRY()`,
/// `rentPriceOracle()`, `isPaymentToken(address)`). See docs/ensv2-alpha-integration.md.
///
/// Confirmed via binary-search on `eth_getCode` across historical blocks: this exact
/// contract set was deployed at block 11382925 on 2026-07-30 — the same day it was found,
/// and *after* the last deployment committed to `ensdomains/contracts-v2` (2026-07-03).
/// That repo's own committed `ETHRegistrar` address differs from this one entirely (different
/// bytecode, different linked registry/oracle) — ENS Labs redeploys this alpha stack
/// without notice. Treat every address below as liable to go stale.
export const ENSV2_ALPHA_ETH_REGISTRAR = "0x8c2e866b439358c41ae05de9cbe8a00bfefaffca" as const;
export const ENSV2_ALPHA_ETH_REGISTRY = "0xdedb92913a25abe1f7bcdd85d8a344a43b398b67" as const;
export const ENSV2_ALPHA_PRICE_ORACLE = "0xe19d37839f42f7d2694d8c5712f412c66a218161" as const;
/// The only ERC-20 this registrar's price oracle actually accepts (confirmed via
/// `isPaymentToken`) — a mintable test token (symbol "USDC", 6 decimals), NOT the
/// `MockUSDC` address committed in `ensdomains/contracts-v2` (that one reverts here with
/// `PaymentTokenNotSupported`). No known public faucet UI, hence the in-app `mint()`
/// affordance on the register page.
export const ENSV2_ALPHA_PAYMENT_TOKEN = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238" as const;
export const ENSV2_ALPHA_PAYMENT_TOKEN_DECIMALS = 6;

/// The exact block this contract set was deployed at (see above) — event scans start
/// here instead of block 0 or a rough estimate.
export const ENSV2_ALPHA_FROM_BLOCK = 11382925n;

/// Both confirmed via live `eth_call` against ENSV2_ALPHA_ETH_REGISTRAR.
export const MIN_COMMITMENT_AGE_SECONDS = 60;
export const MAX_COMMITMENT_AGE_SECONDS = 86400;

// Only the functions/events this app actually calls or reads — not the full ABIs.

export const ethRegistrarAbi = parseAbi([
  "function commit(bytes32 commitment)",
  "function commitmentAt(bytes32 commitment) view returns (uint64 commitTime)",
  "function makeCommitment(string label, address owner, bytes32 secret, address subregistry, address resolver, uint64 duration, bytes32 referrer) view returns (bytes32)",
  "function getRegisterPrice(string label, uint64 duration, address paymentToken) view returns (uint256 base, uint256 premium)",
  "function register(string label, address owner, bytes32 secret, address subregistry, address resolver, uint64 duration, address paymentToken, bytes32 referrer) returns (uint256 tokenId)",
  "event CommitmentMade(bytes32 commitment)",
  "event NameRegistered(uint256 indexed tokenId, string label, address owner, address subregistry, address resolver, uint64 duration, address paymentToken, bytes32 indexed referrer, uint256 base, uint256 premium)",
  "event NameRenewed(uint256 indexed tokenId, string label, uint64 duration, uint64 newExpiry, address paymentToken, bytes32 indexed referrer, uint256 amount)",
]);

export const ethRegistryAbi = parseAbi([
  "function findTokenId(string label) view returns (uint256)",
  "function findOwner(string label) view returns (address)",
  "function findExpiry(string label) view returns (uint64)",
  "function getExpiry(uint256 tokenId) view returns (uint64)",
  "function getOwner(uint256 tokenId) view returns (address)",
  "function getResolver(string label) view returns (address)",
  "function getSubregistry(string label) view returns (address)",
  "function getStatus(uint256 anyId) view returns (uint8)",
  "event LabelRegistered(uint256 indexed tokenId, bytes32 indexed labelHash, string label, address owner, uint64 expiry, address indexed sender)",
  "event TokenRegenerated(uint256 indexed oldTokenId, uint256 indexed newTokenId)",
  "event ResolverUpdated(uint256 indexed tokenId, address indexed resolver, address indexed sender)",
  "event ExpiryUpdated(uint256 indexed tokenId, uint64 indexed newExpiry, address indexed sender)",
  "event LabelUnregistered(uint256 indexed tokenId, address indexed sender)",
]);

/// Minimal ERC-20 surface for the payment-token approve/mint flow — this token has no
/// ABI published anywhere (see ENSV2_ALPHA_PAYMENT_TOKEN's comment), only confirmed
/// live via `symbol()`/`decimals()`/its `mint(uint256)` selector existing in its bytecode.
export const paymentTokenAbi = parseAbi([
  "function balanceOf(address account) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function mint(uint256 amount)",
]);

/// Real ENSv2 Status enum from `IPermissionedRegistry.sol` — NOT the same concept as our
/// own marketplace's OrderStatus.Suspended. The real registry expresses a mutation not by
/// flagging a status, but by regenerating the tokenId entirely (see TokenRegenerated).
export const RegistryStatus = {
  Available: 0,
  Reserved: 1,
  Registered: 2,
} as const;

export interface EnsV2AlphaName {
  tokenId: bigint;
  label: string;
}

/// Real registered names on the alpha, discovered via LabelRegistered event history — no
/// indexer, same discover-via-events pattern as lib/events.ts's useKnownDomainIds etc.
export function useEnsV2AlphaRegisteredNames(): { names: EnsV2AlphaName[]; isError: boolean; refetch: () => void } {
  // Explicit chainId — this integration is always Sepolia regardless of which chain the
  // connected wallet is on (Anvil, the app's default before any wallet connects, has none
  // of these contracts and would otherwise silently return empty/error results).
  const client = usePublicClient({ chainId: sepolia.id });
  const [names, setNames] = useState<EnsV2AlphaName[]>([]);
  const [isError, setIsError] = useState(false);

  const refresh = useCallback(async () => {
    if (!client) return;
    try {
      const logs = await getContractEventsChunked(client, {
        address: ENSV2_ALPHA_ETH_REGISTRY,
        abi: ethRegistryAbi,
        eventName: "LabelRegistered",
        fromBlock: ENSV2_ALPHA_FROM_BLOCK,
      });
      const byTokenId = new Map<string, EnsV2AlphaName>();
      for (const log of logs) {
        const tokenId = log.args.tokenId as bigint;
        byTokenId.set(tokenId.toString(), { tokenId, label: log.args.label as string });
      }
      setNames(Array.from(byTokenId.values()));
      setIsError(false);
    } catch (err) {
      console.error("useEnsV2AlphaRegisteredNames: failed to scan LabelRegistered events", err);
      setIsError(true);
    }
  }, [client]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useWatchContractEvent({
    address: ENSV2_ALPHA_ETH_REGISTRY,
    abi: ethRegistryAbi,
    eventName: "LabelRegistered",
    chainId: sepolia.id,
    onLogs: refresh,
  });

  return { names, isError, refetch: refresh };
}
