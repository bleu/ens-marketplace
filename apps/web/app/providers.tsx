"use client";

import "@rainbow-me/rainbowkit/styles.css";
import { RainbowKitProvider, darkTheme } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { wagmiConfig } from "@/lib/wagmi";
import { NetworkModeProvider } from "@/lib/network-mode";

const queryClient = new QueryClient();

// Override RainbowKit's default light-only modal so it matches the app's
// dark salmao/mono design system (see app/globals.css — "Dark-only; this app
// has no light theme"). Built on top of `darkTheme` and re-pointed at our
// own tokens rather than inventing new colors.
//
// This used to call `darkTheme(...)` and then mutate the returned object's
// `.colors`/`.fonts` properties afterward. That produced an intermittent
// hydration mismatch (RainbowKitProvider's injected <style> tag reflecting
// stock `darkTheme` values — e.g. `--rk-fonts-body: SFRounded...` — on some
// SSR passes instead of these overrides). Spreading everything into one
// object literal up front removes the mutate-after-construction step, so
// there's no intermediate object state for server and client evaluation to
// disagree about.
const rainbowKitBase = darkTheme({
  accentColor: "#ff8668" /* --color-salmao-500 / --brand */,
  accentColorForeground: "#0f1321" /* --color-ink-900 / --brand-ink */,
  borderRadius: "small",
  fontStack: "system",
  overlayBlur: "small",
});

const rainbowKitTheme = {
  ...rainbowKitBase,
  colors: {
    ...rainbowKitBase.colors,
    modalBackground: "#0f1321" /* --bg */,
    modalBorder: "rgba(242, 244, 241, 0.1)" /* --line */,
    modalText: "#f2f4f1" /* --fg */,
    modalTextSecondary: "rgba(242, 244, 241, 0.72)" /* --fg-muted */,
    modalTextDim: "rgba(242, 244, 241, 0.48)" /* --fg-dim */,
    generalBorder: "rgba(242, 244, 241, 0.1)" /* --line */,
    generalBorderDim: "rgba(242, 244, 241, 0.1)" /* --line */,
    profileForeground: "#11192a" /* --bg-raised */,
    closeButtonBackground: "#11192a" /* --bg-raised */,
    connectButtonBackground: "#11192a" /* --bg-raised */,
    connectButtonInnerBackground: "#11192a" /* --bg-raised */,
    menuItemBackground: "#11192a" /* --bg-raised */,
    selectedOptionBorder: "#ff8668" /* --brand */,
  },
  fonts: {
    ...rainbowKitBase.fonts,
    body: '"Geist Mono", ui-monospace, "JetBrains Mono", Menlo, monospace' /* --font-mono */,
  },
};

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider locale="en" theme={rainbowKitTheme}>
          <NetworkModeProvider>{children}</NetworkModeProvider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
