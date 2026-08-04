import "dotenv/config";
import { defineConfig } from "prisma/config";

// `env("DATABASE_URL")` (prisma/config's helper) throws synchronously if the var is
// unset — that's fine for `migrate`/`scrape:grails`, which genuinely need a real
// connection, but it also broke `prisma generate` (which doesn't need one, just the
// schema file) running as apps/api's postinstall during a plain monorepo-wide
// `pnpm install` in CI jobs/contexts that don't set DATABASE_URL at all (e.g. this
// repo's existing `frontend` CI job, which only cares about apps/demo). A placeholder
// fallback keeps `generate`'s config loading from hard-failing in those contexts,
// without masking a real missing-DATABASE_URL problem for `migrate`/the scraper, which
// fail with an actual connection error instead — a clearer signal than a thrown config error.
const DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://placeholder:placeholder@localhost:5432/placeholder";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: DATABASE_URL,
  },
});
