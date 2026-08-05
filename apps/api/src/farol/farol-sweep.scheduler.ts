import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { FarolService } from "./farol.service";

/// Cancelled and filled orders leave no trace in our table, so something has to ask the
/// chain periodically. Five minutes is short enough that a stale listing is a curiosity
/// rather than a wasted purchase attempt, and each pass is two multicalls.
@Injectable()
export class FarolSweepScheduler {
  private readonly logger = new Logger(FarolSweepScheduler.name);

  constructor(private readonly farol: FarolService) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async sweep() {
    try {
      const { checked, removed } = await this.farol.sweep();
      if (removed > 0) this.logger.log(`swept ${checked} orders, removed ${removed}`);
    } catch (err) {
      // A failed sweep is a stale row until the next one, not a reason to take the API
      // down — an RPC hiccup would otherwise surface as an unhandled rejection.
      this.logger.error("sweep failed", err);
    }
  }
}
