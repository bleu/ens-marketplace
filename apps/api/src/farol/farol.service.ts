import { BadRequestException, ConflictException, Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { PublicClient } from "viem";
import { PrismaService } from "../prisma/prisma.service";
import {
  BASE_REGISTRAR_ADDRESS,
  currencySymbolFor,
  NAME_WRAPPER_ADDRESS,
  SEAPORT_CONTRACT_ADDRESS,
  type EnsV1Listing,
} from "../grails/ensv1-types";
import type { FarolListing } from "@prisma/client";
import type { SearchResult as GrailsSearchResult } from "../grails/grails.service";
import { listingFilterWhere, type SearchFilters as ListingSearchFilters } from "../listings/listing-filters";
import { seaportAbi } from "./seaport-abi";

/// Lowercased for comparison — callers send whatever casing their wallet or SDK produced.
const SELLABLE_TOKENS: string[] = [BASE_REGISTRAR_ADDRESS.toLowerCase(), NAME_WRAPPER_ADDRESS.toLowerCase()];

/// Injection token for the mainnet viem client (see FarolModule) — Nest can't resolve a
/// bare type-only interface, so the provider is registered under this name.
export const SEAPORT_CLIENT = "SEAPORT_CLIENT";

/// Only the viem calls this service makes — a per-order read and the sweep's batched one.
/// Narrowed so a test can hand over a stub instead of a whole PublicClient.
export type SeaportClient = Pick<PublicClient, "readContract" | "multicall">;

/// One signed Seaport order, exactly as seaport-js hands it back from createOrder — the
/// shape apps/web POSTs and the shape a buyer's wallet will submit, stored untouched.
export interface SignedOrder {
  parameters: {
    offerer: string;
    zone: string;
    offer: { itemType: number; token: string; identifierOrCriteria: string; startAmount: string; endAmount: string }[];
    consideration: {
      itemType: number;
      token: string;
      identifierOrCriteria: string;
      startAmount: string;
      endAmount: string;
      recipient: string;
    }[];
    orderType: number;
    startTime: string | number;
    endTime: string | number;
    zoneHash: string;
    salt: string;
    conduitKey: string;
    counter: string | number;
  };
  signature: string;
}

/// Same filter and result vocabulary as GrailsService, on purpose (see search below).
export type SearchFilters = ListingSearchFilters;
export type SearchResult = GrailsSearchResult;

const PAGE_SIZE = 50;

export interface CreateListingInput {
  protocolData: SignedOrder;
  name: string;
  tokenContract: string;
  tokenId: string;
  itemType: number;
}

@Injectable()
export class FarolService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(SEAPORT_CLIENT) private readonly seaport: SeaportClient,
  ) {}

  async create(input: CreateListingInput): Promise<{ orderHash: string }> {
    if (!SELLABLE_TOKENS.includes(input.tokenContract.toLowerCase())) {
      throw new BadRequestException(`${input.tokenContract} is not an ENS name contract`);
    }
    const orderHash = await this.orderHashOf(input.protocolData);

    try {
      await this.storeRow(orderHash, input);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw new ConflictException(`Order ${orderHash} is already listed`);
      }
      throw err;
    }

    return { orderHash };
  }

  private async storeRow(orderHash: string, input: CreateListingInput) {
    const { parameters } = input.protocolData;
    await this.prisma.farolListing.create({
      data: {
        orderHash,
        name: input.name,
        nameLength: input.name.replace(/\.eth$/i, "").length,
        tokenContract: input.tokenContract,
        tokenId: input.tokenId,
        itemType: input.itemType,
        priceWei: new Prisma.Decimal(totalConsideration(input.protocolData)),
        priceCurrency: parameters.consideration[0].token,
        protocolAddress: SEAPORT_CONTRACT_ADDRESS,
        protocolData: input.protocolData as unknown as Prisma.InputJsonValue,
        sellerAddress: parameters.offerer,
        counter: String(parameters.counter),
        startTime: Number(parameters.startTime),
        endTime: Number(parameters.endTime),
      },
    });
  }

  /// Same filters, page size and envelope as GrailsService.search — apps/web reads Farol
  /// and Grails rows through one hook, so a difference here would show up as the two
  /// sources paginating differently in the same grid.
  async search(filters: SearchFilters, page: number): Promise<SearchResult> {
    const where: Prisma.FarolListingWhereInput = { ...listingFilterWhere(filters), endTime: { gt: nowInSeconds() } };

    const [rows, total] = await Promise.all([
      this.prisma.farolListing.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
      this.prisma.farolListing.count({ where }),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    return {
      listings: rows.map(toEnsV1Listing),
      // Every row was stored with a resolved name and a real signature, so unlike the
      // OpenSea feed nothing is ever dropped between query and response.
      unresolvedCount: 0,
      next: page < totalPages ? page + 1 : null,
      total,
      totalPages,
    };
  }

  async findByName(name: string): Promise<EnsV1Listing | null> {
    const row = await this.prisma.farolListing.findFirst({
      where: { name: { equals: name, mode: "insensitive" }, endTime: { gt: nowInSeconds() } },
      orderBy: { createdAt: "desc" },
    });
    return row ? toEnsV1Listing(row) : null;
  }

  /// Reconciles every stored order with the chain. Expired rows go first, without an RPC
  /// call: their endTime already decides them, and they can never become live again.
  async sweep(): Promise<{ checked: number; removed: number }> {
    const expired = await this.prisma.farolListing.deleteMany({ where: { endTime: { lte: nowInSeconds() } } });

    const rows = await this.prisma.farolListing.findMany({ where: {} });
    if (rows.length === 0) return { checked: 0, removed: expired.count };

    const offerers = [...new Set(rows.map((row) => row.sellerAddress))];
    const [statuses, counters] = await Promise.all([
      this.seaport.multicall({
        allowFailure: false,
        contracts: rows.map((row) => ({
          address: SEAPORT_CONTRACT_ADDRESS,
          abi: seaportAbi,
          functionName: "getOrderStatus",
          args: [row.orderHash as `0x${string}`],
        })),
      }),
      this.seaport.multicall({
        allowFailure: false,
        contracts: offerers.map((offerer) => ({
          address: SEAPORT_CONTRACT_ADDRESS,
          abi: seaportAbi,
          functionName: "getCounter",
          args: [offerer as `0x${string}`],
        })),
      }),
    ]);

    const currentCounter = new Map(offerers.map((offerer, i) => [offerer, counters[i] as bigint]));
    const dead = rows.filter((row, i) => {
      const [, isCancelled, totalFilled, totalSize] = statuses[i] as [boolean, boolean, bigint, bigint];
      const staleCounter = BigInt(row.counter) < (currentCounter.get(row.sellerAddress) ?? 0n);
      return isCancelled || isFullyFilled(totalFilled, totalSize) || staleCounter;
    });

    if (dead.length > 0) {
      await this.prisma.farolListing.deleteMany({ where: { orderHash: { in: dead.map((row) => row.orderHash) } } });
    }

    return { checked: rows.length, removed: expired.count + dead.length };
  }

  /// Verifies one stored order against the chain and forgets it if it's over. Safe to leave
  /// unauthenticated: the caller's claim is never taken at face value, Seaport's answer is.
  async recheck(orderHash: string): Promise<{ removed: boolean }> {
    const [, isCancelled, totalFilled, totalSize] = await this.seaport.readContract({
      address: SEAPORT_CONTRACT_ADDRESS,
      abi: seaportAbi,
      functionName: "getOrderStatus",
      args: [orderHash as `0x${string}`],
    });

    if (!isCancelled && !isFullyFilled(totalFilled, totalSize)) return { removed: false };

    await this.prisma.farolListing.deleteMany({ where: { orderHash } });
    return { removed: true };
  }

  /// Asked of Seaport itself rather than computed here, and never taken from the request
  /// body: the hash has to be the one Seaport will derive when the order is fulfilled or
  /// cancelled, or every later status check looks up an order that doesn't exist.
  private async orderHashOf(order: SignedOrder): Promise<string> {
    const p = order.parameters;
    const hash = await this.seaport.readContract({
      address: SEAPORT_CONTRACT_ADDRESS,
      abi: seaportAbi,
      functionName: "getOrderHash",
      args: [
        {
          offerer: p.offerer as `0x${string}`,
          zone: p.zone as `0x${string}`,
          offer: p.offer.map((item) => ({
            itemType: item.itemType,
            token: item.token as `0x${string}`,
            identifierOrCriteria: BigInt(item.identifierOrCriteria),
            startAmount: BigInt(item.startAmount),
            endAmount: BigInt(item.endAmount),
          })),
          consideration: p.consideration.map((item) => ({
            itemType: item.itemType,
            token: item.token as `0x${string}`,
            identifierOrCriteria: BigInt(item.identifierOrCriteria),
            startAmount: BigInt(item.startAmount),
            endAmount: BigInt(item.endAmount),
            recipient: item.recipient as `0x${string}`,
          })),
          orderType: p.orderType,
          startTime: BigInt(p.startTime),
          endTime: BigInt(p.endTime),
          zoneHash: p.zoneHash as `0x${string}`,
          salt: BigInt(p.salt),
          conduitKey: p.conduitKey as `0x${string}`,
          counter: BigInt(p.counter),
        },
      ],
    });
    return hash as string;
  }
}

/// Same translation GrailsService does, against our own columns — .toFixed(0) rather than
/// .toString() so a large wei amount never arrives as exponential notation.
function toEnsV1Listing(row: FarolListing): EnsV1Listing {
  const priceValue = row.priceWei.toFixed(0);
  const currency = currencySymbolFor(row.priceCurrency);
  const protocolData = row.protocolData as unknown as EnsV1Listing["listing"]["protocol_data"];
  return {
    name: row.name,
    price: { value: priceValue, decimals: 18, currency },
    listing: {
      order_hash: row.orderHash,
      protocol_address: row.protocolAddress,
      protocol_data: protocolData,
      price: { current: { value: priceValue, decimals: 18, currency } },
    },
    source: "farol",
  };
}

/// Seaport reports fills as a fraction, not a flag — totalSize is 0 for an order it has
/// never touched, so "filled" means a nonzero size that has been consumed completely.
function isFullyFilled(totalFilled: bigint, totalSize: bigint): boolean {
  return totalSize > 0n && totalFilled >= totalSize;
}

/// Seaport's own unit for startTime/endTime.
function nowInSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

/// What a buyer actually pays: every consideration item summed, not just the seller's.
/// Our own orders carry one item, but the endpoint accepts orders it didn't build.
function totalConsideration(order: SignedOrder): string {
  return order.parameters.consideration.reduce((sum, item) => sum + BigInt(item.startAmount), 0n).toString();
}
