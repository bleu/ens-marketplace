import { execFileSync } from "node:child_process";
import { createServer } from "node:net";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TestProject } from "vitest/node";

/// GrailsService's whole job is translating filters into SQL, so its tests run against a
/// real Postgres rather than a faked PrismaClient — a fake could only ever assert the
/// shape of the `where` object it was handed, which says nothing about whether the query
/// actually selects the right rows. Trigram similarity and Decimal(78,0) range
/// comparisons in particular have no meaningful behaviour outside the database.
///
/// Set TEST_DATABASE_URL to run against a Postgres you already have (this is how CI does
/// it, via a `services: postgres` block). Without it, a throwaway cluster is created in
/// the OS temp dir and destroyed afterwards. DATABASE_URL is deliberately *not* honoured
/// here: tests truncate between cases, and silently pointing that at a developer's real
/// scraped dataset would wipe it.

interface Cluster {
  url: string;
  stop: () => void;
}

/// Binds port 0, reads back what the OS picked, then releases it. Racy in principle
/// (something else could take it in the gap) but not in practice for a test run, and it
/// beats hardcoding a port that collides with a real local Postgres.
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        server.close();
        reject(new Error("could not reserve a port"));
        return;
      }
      const { port } = address;
      server.close(() => resolve(port));
    });
  });
}

function pg(bin: string, args: string[], env?: NodeJS.ProcessEnv) {
  execFileSync(bin, args, { stdio: "pipe", env: { ...process.env, ...env } });
}

async function startThrowawayCluster(): Promise<Cluster> {
  const root = mkdtempSync(join(tmpdir(), "farol-api-test-pg-"));
  const data = join(root, "data");
  const port = await freePort();

  // --auth=trust: this cluster listens on 127.0.0.1 on a random port for the duration of
  // one test run and holds nothing but fixture rows, so a password would be ceremony.
  // --no-sync skips fsync during initdb, which is the bulk of its runtime.
  pg("initdb", ["-D", data, "-U", "postgres", "--auth=trust", "--no-sync"]);
  pg("pg_ctl", [
    "-D",
    data,
    "-l",
    join(root, "postgres.log"),
    "-o",
    `-p ${port} -c listen_addresses=127.0.0.1 -c fsync=off -c full_page_writes=off`,
    "-w",
    "start",
  ]);

  const stop = () => {
    try {
      pg("pg_ctl", ["-D", data, "-m", "immediate", "-w", "stop"]);
    } catch {
      // Already down (a crashed cluster, or a second teardown) — the rm below is what
      // actually matters, and leaving a temp dir behind is worse than a noisy stop.
    }
    rmSync(root, { recursive: true, force: true });
  };

  try {
    pg("createdb", ["-h", "127.0.0.1", "-p", String(port), "-U", "postgres", "farol_test"]);
  } catch (err) {
    stop();
    throw err;
  }

  return { url: `postgresql://postgres@127.0.0.1:${port}/farol_test?schema=public`, stop };
}

/// Vitest's globalSetup runs in the main process before any worker is forked, so setting
/// process.env.DATABASE_URL here is what PrismaService picks up in the workers (it reads
/// the var directly — see src/prisma/prisma.service.ts).
export async function setup(project: TestProject) {
  const existing = process.env.TEST_DATABASE_URL;
  const cluster: Cluster = existing ? { url: existing, stop: () => {} } : await startThrowawayCluster();

  process.env.DATABASE_URL = cluster.url;

  try {
    // `migrate deploy`, not `db push` — the trigram extension and its GIN index live in a
    // raw SQL migration, and `db push` derives the schema from schema.prisma alone, so it
    // would silently skip them and leave fuzzy search untested.
    execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
      // The vitest root is apps/api, which is where prisma.config.ts and the migrations
      // live — taken from the project rather than process.cwd() so the harness still works
      // when vitest is invoked from the monorepo root.
      cwd: project.config.root,
      stdio: "pipe",
      env: { ...process.env, DATABASE_URL: cluster.url },
    });
  } catch (err) {
    cluster.stop();
    // execFileSync's own message says only "Command failed" — the actual migration error is
    // on stderr, so it's surfaced here or the failure is undiagnosable.
    const detail = err instanceof Error && "stderr" in err ? String(err.stderr) : String(err);
    throw new Error(`prisma migrate deploy failed:\n${detail}`, { cause: err });
  }

  return () => cluster.stop();
}
