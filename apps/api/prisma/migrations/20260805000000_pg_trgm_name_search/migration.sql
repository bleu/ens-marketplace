-- Fuzzy name search for the Explore sidebar. Prisma has no similarity operator, so this
-- is a raw migration: GrailsService runs a raw ranked query for candidate names and feeds
-- them back into the normal typed filter builder (see GrailsService.search).
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- gin_trgm_ops, not the default GIN opclass — plain GIN can't serve trigram similarity.
CREATE INDEX IF NOT EXISTS "GrailsListing_name_trgm_idx" ON "GrailsListing" USING GIN ("name" gin_trgm_ops);
