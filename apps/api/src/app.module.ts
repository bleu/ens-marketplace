import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { PrismaModule } from "./prisma/prisma.module";
import { GrailsModule } from "./grails/grails.module";
import { ScraperModule } from "./scraper/scraper.module";

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, GrailsModule, ScraperModule],
})
export class AppModule {}
