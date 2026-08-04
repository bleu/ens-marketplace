/// CLI entrypoint for the GitHub Actions cron (see .github/workflows/scrape-grails.yml)
/// and manual backfills (`pnpm --filter api run scrape:grails`). Deliberately bypasses
/// Nest's DI container and constructs PrismaService/ScraperService directly — this is run
/// via `tsx` (esbuild-based), which doesn't emit the decorator metadata Nest's
/// constructor-injection relies on, and there's no need to boot an HTTP listener or the
/// full app graph just to run one service's one method.
import "dotenv/config";
import "reflect-metadata";
import { PrismaService } from "../prisma/prisma.service";
import { ScraperService } from "./scraper.service";

async function main() {
  const prisma = new PrismaService();
  await prisma.$connect();
  try {
    const scraper = new ScraperService(prisma);
    const summary = await scraper.run();
    console.log(`Grails scrape complete: ${JSON.stringify(summary)}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("Grails scrape failed:", err);
  process.exitCode = 1;
});
