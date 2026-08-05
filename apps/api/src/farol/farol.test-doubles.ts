import { Prisma } from "@prisma/client";
import type { PrismaService } from "../prisma/prisma.service";
import type { SeaportClient, SignedOrder } from "./farol.service";

/// What Prisma raises when a unique index rejects an insert — the real error class, so the
/// service's handling of it isn't tested against a shape only this file believes in.
function uniqueViolation(field: string) {
  return new Prisma.PrismaClientKnownRequestError(`Unique constraint failed on the fields: (\`${field}\`)`, {
    code: "P2002",
    clientVersion: Prisma.prismaVersion.client,
    meta: { target: [field] },
  });
}

/// Stand-ins for the two things FarolService talks to: the FarolListing table and a viem
/// client pointed at mainnet.

/// Rows exactly as the service handed them over — priceWei is still a Prisma.Decimal, so
/// assertions on it go through String() the way the read path's .toFixed(0) does.
export type FakeRow = Record<string, unknown> & { orderHash: string };

export class FakeFarolTable {
  rows: FakeRow[] = [];
  private inserted = 0;

  asPrisma(): PrismaService {
    return {
      farolListing: {
        create: async ({ data }: { data: Prisma.FarolListingCreateInput }) => {
          if (this.rows.some((row) => row.orderHash === data.orderHash)) throw uniqueViolation("orderHash");
          // createdAt comes from a column default in the real table; here it's insertion
          // order, which is what "most recently listed" means for a test's purposes.
          const row = { ...data, createdAt: new Date(++this.inserted) } as FakeRow;
          this.rows.push(row);
          return row;
        },
        findFirst: async ({ where, orderBy }: { where: Prisma.FarolListingWhereInput; orderBy?: unknown }) =>
          this.query(where, orderBy)[0] ?? null,
        findMany: async ({
          where,
          orderBy,
          skip = 0,
          take,
        }: {
          where: Prisma.FarolListingWhereInput;
          orderBy?: unknown;
          skip?: number;
          take?: number;
        }) => this.query(where, orderBy).slice(skip, take === undefined ? undefined : skip + take),
        count: async ({ where }: { where: Prisma.FarolListingWhereInput }) => this.query(where).length,
        deleteMany: async ({ where }: { where: Prisma.FarolListingWhereInput }) => {
          const doomed = this.query(where);
          this.rows = this.rows.filter((row) => !doomed.includes(row));
          return { count: doomed.length };
        },
      },
    } as unknown as PrismaService;
  }

  /// Only the one ordering the service asks for (newest first) — anything else is ignored
  /// rather than silently mis-sorted, so a future orderBy would fail loudly in a test.
  private query(where: Prisma.FarolListingWhereInput, orderBy?: unknown): FakeRow[] {
    const found = this.rows.filter((row) => matches(row, where));
    if (orderBy === undefined) return found;
    if (JSON.stringify(orderBy) !== JSON.stringify({ createdAt: "desc" })) {
      throw new Error(`FakeFarolTable doesn't implement orderBy ${JSON.stringify(orderBy)}`);
    }
    return [...found].reverse();
  }
}

/// Evaluates the subset of Prisma's where syntax FarolService actually builds. Anything
/// else throws: a filter this fake quietly ignored would make a test claim the service
/// selects rows it wouldn't.
function matches(row: FakeRow, where: Prisma.FarolListingWhereInput): boolean {
  return Object.entries(where).every(([field, condition]) => {
    const value = row[field];
    if (condition !== null && typeof condition === "object") {
      const clause = condition as Record<string, unknown>;
      if ("in" in clause) return (clause.in as unknown[]).includes(value);
      if ("gt" in clause) return Number(value) > Number(clause.gt);
      // Wei-scale integers, so compared as BigInt — Number would lose precision at exactly
      // the magnitudes a price filter has to decide between.
      if ("gte" in clause || "lte" in clause) {
        const amount = BigInt(String(value));
        if (clause.gte !== undefined && amount < BigInt(String(clause.gte))) return false;
        if (clause.lte !== undefined && amount > BigInt(String(clause.lte))) return false;
        return true;
      }
      if ("equals" in clause) {
        if (clause.mode === "insensitive") return String(value).toLowerCase() === String(clause.equals).toLowerCase();
        return value === clause.equals;
      }
      throw new Error(`FakeFarolTable doesn't implement where.${field} ${JSON.stringify(clause)}`);
    }
    return value === condition;
  });
}

export interface FakeOrderStatus {
  validated?: boolean;
  cancelled?: boolean;
  totalFilled?: bigint;
  totalSize?: bigint;
}

/// Stands in for the Seaport views this service reads.
///
/// `orderHash` fixes what getOrderHash answers — pass it when the spec is about two orders
/// colliding on one hash; omit it and each distinct order gets its own, as on-chain.
/// `orderStatus` is what getOrderStatus reports: an untouched, uncancelled order by
/// default, returned as the 4-tuple viem produces for that function's outputs.
export function fakeSeaportReads({
  orderHash,
  orderStatus = {},
  statusByHash = {},
  counters = {},
}: {
  orderHash?: string;
  orderStatus?: FakeOrderStatus;
  /// Per-order overrides, for specs holding several orders at once.
  statusByHash?: Record<string, FakeOrderStatus>;
  /// Each offerer's current Seaport counter. Absent addresses have never incremented.
  counters?: Record<string, bigint>;
} = {}): SeaportClient {
  const answer = ({ functionName, args }: { functionName: string; args: unknown[] }) => {
    if (functionName === "getOrderStatus") {
      const hash = String(args[0]);
      const { validated = true, cancelled = false, totalFilled = 0n, totalSize = 0n } = statusByHash[hash] ?? orderStatus;
      return [validated, cancelled, totalFilled, totalSize];
    }
    if (functionName === "getCounter") return counters[String(args[0])] ?? 0n;
    return orderHash ?? digestOf(args);
  };
  return {
    readContract: async (call: { functionName: string; args: unknown[] }) => answer(call),
    multicall: async ({ contracts }: { contracts: { functionName: string; args: unknown[] }[] }) => contracts.map(answer),
  } as unknown as SeaportClient;
}

function digestOf(value: unknown): string {
  const json = JSON.stringify(value, (_key, v) => (typeof v === "bigint" ? v.toString() : v));
  let hash = 0n;
  for (const char of json) hash = (hash * 31n + BigInt(char.codePointAt(0) ?? 0)) % 2n ** 256n;
  return `0x${hash.toString(16).padStart(64, "0")}`;
}

const ETH = "0x0000000000000000000000000000000000000000";

/// A signed order shaped like the ones apps/web will build: one ERC-1155 offer item, one
/// native-ETH consideration item paying the offerer in full. Defaults are deliberately
/// boring and live (endTime in 2096) so a spec only states the field it is about.
export function signedOrder(
  overrides: Partial<{ offerer: string; priceWei: string; counter: string; startTime: number; endTime: number; salt: string }> = {},
): SignedOrder {
  const {
    offerer = "0x1111111111111111111111111111111111111111",
    priceWei = "1000000000000000000",
    counter = "0",
    startTime = 1000,
    endTime = 4_000_000_000,
    salt = "1",
  } = overrides;
  return {
    parameters: {
      offerer,
      zone: ETH,
      offer: [
        {
          itemType: 3,
          token: "0xD4416b13d2b3a9aBae7AcD5D6C2BbDBE25686401",
          identifierOrCriteria: "42",
          startAmount: "1",
          endAmount: "1",
        },
      ],
      consideration: [
        {
          itemType: 0,
          token: ETH,
          identifierOrCriteria: "0",
          startAmount: priceWei,
          endAmount: priceWei,
          recipient: offerer,
        },
      ],
      orderType: 0,
      startTime,
      endTime,
      zoneHash: `0x${"0".repeat(64)}`,
      salt,
      conduitKey: `0x${"0".repeat(64)}`,
      counter,
    },
    signature: "0xdeadbeef",
  };
}
