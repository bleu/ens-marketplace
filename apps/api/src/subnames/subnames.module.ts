import { Module } from "@nestjs/common";
import { SubnamesService } from "./subnames.service";
import { SubnamesController } from "./subnames.controller";

@Module({
  providers: [SubnamesService],
  controllers: [SubnamesController],
})
export class SubnamesModule {}
