import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { PrismaModule } from "./prisma/prisma.module";
import { GrailsModule } from "./grails/grails.module";
import { ScraperModule } from "./scraper/scraper.module";
import { IndexerGraphqlModule } from "./indexer-graphql/indexer-graphql.module";
import { DomainsModule } from "./domains/domains.module";
import { SubnamesModule } from "./subnames/subnames.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    GrailsModule,
    ScraperModule,
    IndexerGraphqlModule,
    DomainsModule,
    SubnamesModule,
  ],
})
export class AppModule {}
