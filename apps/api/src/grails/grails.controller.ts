import { Controller, Get, Query } from "@nestjs/common";
import { GrailsService } from "./grails.service";

@Controller("grails")
export class GrailsController {
  constructor(private readonly grails: GrailsService) {}

  /// GET /grails/search?page=&minPrice=&maxPrice=&minLength=&maxLength=&startsWith=&endsWith=
  /// Same param names/semantics as Grails' own live API and apps/web's current proxy route.
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
    return this.grails.search(
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

  /// GET /grails/by-name?name=alice.eth — replaces Grails' fuzzy q= search with an exact,
  /// case-insensitive match (apps/web's current route already re-filters q= results down
  /// to an exact match itself, so this is a straight port of that same intent).
  @Get("by-name")
  async byName(@Query("name") name: string) {
    const listing = name ? await this.grails.findByName(name) : null;
    return { listing };
  }
}
