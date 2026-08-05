import { Injectable } from "@nestjs/common";
import { GraphQLClient } from "graphql-request";

/// apps/api never owns the ENSv2 indexer's schema — Envio's HyperIndex (apps/indexer)
/// does, via its own generated Hasura instance. This is a thin, read-only GraphQL client
/// of that endpoint, the same relationship apps/api has with Grails' live API before a
/// scrape (just permanent here, not a migration step).
@Injectable()
export class IndexerGraphqlService {
  private readonly client: GraphQLClient;

  constructor() {
    const url = process.env.INDEXER_GRAPHQL_URL ?? "http://localhost:8080/v1/graphql";
    // "testing" matches Envio's own local-dev default admin secret (see apps/indexer's
    // generated .env) — override via INDEXER_HASURA_ADMIN_SECRET for any real deployment.
    const adminSecret = process.env.INDEXER_HASURA_ADMIN_SECRET ?? "testing";
    this.client = new GraphQLClient(url, { headers: { "x-hasura-admin-secret": adminSecret } });
  }

  request<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
    return this.client.request<T>(query, variables);
  }
}
