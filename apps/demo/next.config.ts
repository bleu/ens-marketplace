import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @wagmi/connectors depends on @base-org/account, whose unused payment/charge features
  // pull in @coinbase/cdp-sdk — which has broken dynamic imports for optional @x402/*
  // packages we don't install (Grails hits the same dependency and doesn't install them
  // either — see apps/demo/stubs/cdp-sdk-noop.ts for the full explanation).
  turbopack: {
    resolveAlias: {
      "@coinbase/cdp-sdk": "./stubs/cdp-sdk-noop.ts",
    },
  },
};

export default nextConfig;
