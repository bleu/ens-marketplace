import { BadRequestException, Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { FarolService, type CreateListingInput } from "./farol.service";

/// Farol's own order book. Read endpoints mirror /grails exactly (same params, same
/// response envelope) so apps/web can hit either through one code path.
@Controller("farol-listings")
export class FarolController {
  constructor(private readonly farol: FarolService) {}

  /// POST /farol-listings — a seller's signed Seaport order. Everything worth trusting is
  /// derived from the order itself (see FarolService.create); the body's other fields only
  /// say which name and token the order is about.
  @Post()
  async create(@Body() body: Partial<CreateListingInput>) {
    const { protocolData, name, tokenContract, tokenId, itemType } = body;
    if (!protocolData?.parameters || !protocolData.signature) {
      throw new BadRequestException("protocolData must carry Seaport order parameters and a signature");
    }
    if (!name || !tokenContract || !tokenId || itemType === undefined) {
      throw new BadRequestException("name, tokenContract, tokenId and itemType are required");
    }
    return this.farol.create({ protocolData, name, tokenContract, tokenId, itemType });
  }

  /// GET /farol-listings/search?page=&minPrice=&maxPrice=&minLength=&maxLength=&startsWith=&endsWith=
  @Get("search")
  async search(
    @Query("page") page?: string,
    @Query("minPrice") minPrice?: string,
    @Query("maxPrice") maxPrice?: string,
    @Query("minLength") minLength?: string,
    @Query("maxLength") maxLength?: string,
    @Query("startsWith") startsWith?: string,
    @Query("endsWith") endsWith?: string,
  ) {
    return this.farol.search(
      {
        minPriceEth: minPrice,
        maxPriceEth: maxPrice,
        minLength: minLength ? Number(minLength) : undefined,
        maxLength: maxLength ? Number(maxLength) : undefined,
        startsWith,
        endsWith,
      },
      page ? Number(page) : 1,
    );
  }

  /// GET /farol-listings/by-name?name=alice.eth
  @Get("by-name")
  async byName(@Query("name") name: string) {
    const listing = name ? await this.farol.findByName(name) : null;
    return { listing };
  }

  /// POST /farol-listings/:orderHash/recheck — called by a seller's browser once their
  /// cancel transaction confirms. Unauthenticated on purpose: it believes Seaport, not the
  /// caller, so the worst a stranger can do is make us spend one RPC call.
  @Post(":orderHash/recheck")
  async recheck(@Param("orderHash") orderHash: string) {
    return this.farol.recheck(orderHash);
  }
}
