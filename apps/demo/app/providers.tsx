"use client";

import "@rainbow-me/rainbowkit/styles.css";
import { RainbowKitProvider, darkTheme } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { wagmiConfig } from "@/lib/wagmi";

const queryClient = new QueryClient();

// Override RainbowKit's default light-only modal so it matches the app's
// dark aqua/mono design system (see app/globals.css — "Dark-only; this app
// has no light theme"). Built on top of `darkTheme` and re-pointed at our
// own tokens rather than inventing new colors.
const rainbowKitTheme = darkTheme({
  accentColor: "#20c5d9" /* --color-aqua-500 / --brand */,
  accentColorForeground: "#0f1321" /* --color-ink-900 / --brand-ink */,
  borderRadius: "small",
  fontStack: "system",
  overlayBlur: "small",
});

rainbowKitTheme.colors.modalBackground = "#0f1321" /* --bg */;
rainbowKitTheme.colors.modalBorder = "rgba(242, 244, 241, 0.1)" /* --line */;
rainbowKitTheme.colors.modalText = "#f2f4f1" /* --fg */;
rainbowKitTheme.colors.modalTextSecondary = "rgba(242, 244, 241, 0.72)" /* --fg-muted */;
rainbowKitTheme.colors.modalTextDim = "rgba(242, 244, 241, 0.48)" /* --fg-dim */;
rainbowKitTheme.colors.generalBorder = "rgba(242, 244, 241, 0.1)" /* --line */;
rainbowKitTheme.colors.generalBorderDim = "rgba(242, 244, 241, 0.1)" /* --line */;
rainbowKitTheme.colors.profileForeground = "#11192a" /* --bg-raised */;
rainbowKitTheme.colors.closeButtonBackground = "#11192a" /* --bg-raised */;
rainbowKitTheme.colors.connectButtonBackground = "#11192a" /* --bg-raised */;
rainbowKitTheme.colors.connectButtonInnerBackground = "#11192a" /* --bg-raised */;
rainbowKitTheme.colors.menuItemBackground = "#11192a" /* --bg-raised */;
rainbowKitTheme.colors.selectedOptionBorder = "#20c5d9" /* --brand */;
rainbowKitTheme.fonts.body =
  '"Geist Mono", ui-monospace, "JetBrains Mono", Menlo, monospace' /* --font-mono */;

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider locale="en" theme={rainbowKitTheme}>
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
