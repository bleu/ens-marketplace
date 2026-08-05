import { Global, Module } from "@nestjs/common";
import { IndexerGraphqlService } from "./indexer-graphql.service";

@Global()
@Module({
  providers: [IndexerGraphqlService],
  exports: [IndexerGraphqlService],
})
export class IndexerGraphqlModule {}
