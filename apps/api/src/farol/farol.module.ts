import { Logger, Module } from "@nestjs/common";
import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";
import { FarolController } from "./farol.controller";
import { FarolService, SEAPORT_CLIENT } from "./farol.service";
import { FarolSweepScheduler } from "./farol-sweep.scheduler";

/// Falls back to viem's default public mainnet transport when MAINNET_RPC_URL is unset, so
/// a developer working on the Grails side of this app doesn't need an RPC key to boot it.
/// That default is shared and rate-limited — every real deployment sets the var (see
/// .env.example and deploy/docker-compose.yml).
function createMainnetClient() {
  const url = process.env.MAINNET_RPC_URL;
  if (!url) new Logger("FarolModule").warn("MAINNET_RPC_URL is unset — falling back to a public, rate-limited mainnet RPC");
  return createPublicClient({ chain: mainnet, transport: http(url) });
}

@Module({
  controllers: [FarolController],
  providers: [FarolService, FarolSweepScheduler, { provide: SEAPORT_CLIENT, useFactory: createMainnetClient }],
  exports: [FarolService],
})
export class FarolModule {}
