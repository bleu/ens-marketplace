import { Controller, Get, Query } from "@nestjs/common";
import { SubnamesService } from "./subnames.service";

@Controller("subnames")
export class SubnamesController {
  constructor(private readonly subnames: SubnamesService) {}

  /// GET /subnames/search?page=
  @Get("search")
  async search(@Query("page") page?: string) {
    return this.subnames.search(page ? Number(page) : 1);
  }

  /// GET /subnames/count?parentId=<registry canonicalId>
  @Get("count")
  async count(@Query("parentId") parentId?: string) {
    return { count: parentId ? await this.subnames.countByParent(parentId) : 0 };
  }
}
