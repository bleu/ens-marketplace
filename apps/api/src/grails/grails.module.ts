import { Module } from "@nestjs/common";
import { GrailsController } from "./grails.controller";
import { GrailsService } from "./grails.service";

@Module({
  controllers: [GrailsController],
  providers: [GrailsService],
  exports: [GrailsService],
})
export class GrailsModule {}
