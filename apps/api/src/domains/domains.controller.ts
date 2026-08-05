import { Controller, Get, Param, Query } from "@nestjs/common";
import { DomainsService } from "./domains.service";

@Controller("domains")
export class DomainsController {
  constructor(private readonly domains: DomainsService) {}

  /// GET /domains/search?tab=names|listings&page=
  @Get("search")
  async search(@Query("tab") tab?: string, @Query("page") page?: string) {
    return this.domains.search(tab === "listings" ? "listings" : "names", page ? Number(page) : 1);
  }

  /// GET /domains/owned?address=0x...
  @Get("owned")
  async owned(@Query("address") address?: string) {
    return { names: address ? await this.domains.owned(address) : [] };
  }

  /// GET /domains/:canonicalId/activity
  @Get(":canonicalId/activity")
  async activity(@Param("canonicalId") canonicalId: string) {
    return { items: await this.domains.activity(canonicalId) };
  }

  /// GET /domains/:canonicalId/last-sale
  @Get(":canonicalId/last-sale")
  async lastSale(@Param("canonicalId") canonicalId: string) {
    return { sale: await this.domains.lastSale(canonicalId) };
  }
}
