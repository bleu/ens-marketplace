# Explore filters: rework plan

The `/domains` filter sidebar doesn't work the way anyone browsing ENS names would expect. This records what's wrong, what we decided to do about it, and the order to build it in. Scope is the ENSv1 mainnet feed only. The ENSv2 alpha view keeps its current placeholder.

## Shipping

This lands in two parts, because the backend's deploy pipeline isn't finished and the frontend half is worth shipping now.

**Part one** needs no backend change. The feed becomes Grails-only, the sidebar's Source block goes, filtering stops happening in the browser, the header count becomes honest, and the filters gain a summary, a clear-all and a mobile drawer. Every filter it uses (`minPrice`, `maxPrice`, `minLength`, `maxLength`, `startsWith`, `endsWith`) already exists in the deployed API.

**Part two** is everything that needs new query params: the length chips and their counts, sorting, fuzzy search, and the price sanity band — plus the `apps/api` work behind them and the `pg_trgm` migration. It can't be deployed until the API is.

## What's wrong today

**The "Source" block isn't a filter.** Buttons in one list do two unrelated jobs. `ENSv1` / `ENSv2` set `networkMode`, which is "what am I browsing" and is global app state. `Grails` and `OpenSea` pick a marketplace inside ENSv1. Nobody browsing for a name thinks in either vocabulary, and the mode half doesn't belong in a filter panel at all — worse, since the ENSv2 mock marketplace was removed there's exactly one mode per chain, so the mode buttons now set the mode they're already in. They are dead controls.

**OpenSea can't be filtered.** Its listings endpoint takes no filter params, so `matchesFilters` in `apps/web/app/domains/page.tsx` sifts whichever 50 rows are already in the browser. Set a price ceiling and you get three rows on "page 1 of many". Grails is our own Postgres and filters properly server-side, so the two sources behave nothing alike behind an identical-looking UI.

**The filter vocabulary is wrong for the audience.** `price min/max`, `length min/max`, `starts with`, `ends with`. That's a developer's model of a name. A buyer's actual query is "4-letter names under 1 ETH" or "show me the 999 club". There's also no substring filter at all.

**There's no sorting.** Grails comes back `scrapedAt desc`, not user-changeable. On a marketplace, "cheapest first" is the first thing anyone reaches for.

**Search dead-ends on typos.** The top nav box does an exact subgraph lookup and shows "Not found" for anything slightly off.

## Decisions

The source block is deleted, and nothing replaces it. Picking a universe and picking a chain are the same act to a user, and since the ENSv2 mock was removed the mapping is one universe per chain (mainnet → ENSv1, Sepolia → ENSv2 alpha), which `NetworkModeProvider` already follows automatically. The nav's chain selector *is* the universe picker.

An earlier draft of this plan called for a custom dropdown in `TopNav.tsx`, on the grounds that RainbowKit's `openChainModal` can't hold two entries for one chain. That was true while Sepolia carried both our ENSv2 mock and ENS Labs' alpha. It no longer is, so the custom control would duplicate a control that already works. Nothing is lost by deleting the Source block either: its mode buttons only ever appeared for the chain whose mode was already selected.

The ENSv1 browse feed is Grails-only. OpenSea drops out of browse entirely and stays where it already works, on the detail page via `useEnsV1ListingForName`. This means every row in the feed comes from our own Postgres, so filters, sorting, counts and pagination all become honest at once. Aggregating OpenSea into the feed needs its listings scraped into our database the same way Grails' are, and that's deferred.

Filters become chips, with the numeric ranges kept but collapsed behind Advanced. Multiple selections inside a group are OR'd, groups are AND'd.

There is one chip group: name length (`3`, `4`, `5`, `6+`). Character class (`digits only` / `letters only` / `mixed`) and club presets were both cut. They were the only consumers of the `charClass`, `hasHyphen` and `hasEmoji` columns, so that migration, the `ScraperService` change to compute them and the backfill script all disappear with them. The `6+` chip is the one that isn't an exact length, so the group is a list OR'd against an open-ended minimum rather than a single `IN (...)`.

Sorting defaults to `Price ↑` with `Price ↓`, `Length ↑`, `Name A-Z` and `Recently listed` available.

Both tails of the price distribution are noise and get a sanity band. A dust floor hides listings below a threshold, and a ceiling hides the absurd ones (the dataset contains a real listing at roughly 1.2×10²⁶ wei, about 120 million ETH, recorded in `grails-migration.md` as the row that overflowed a Postgres `bigint`). Both are display-level only, nothing is dropped at scrape time, and a visible toggle turns them off. The band and an explicit price filter both land on `priceWei`, and a Prisma `DecimalFilter` has one `gte`/`lte` slot each, so they're merged by taking whichever bound is tighter — an explicit ceiling inside the band still narrows, and one outside it doesn't widen past it.

Search is trigram-based fuzzy matching over the listed names, in one sidebar box that replaces `starts with`, `ends with` and the missing `contains`. Anchored variants move to Advanced.

It uses `word_similarity`, not `similarity`. This is a correction to the original plan, which assumed plain trigram similarity would cover substring matching as a side effect. It doesn't: `similarity` scores the query against the whole name, so the unmatched remainder plus the `.eth` every name carries dilutes the score past usefulness. Measured against a real Postgres, `punk` scores 0.18 against `cryptopunk.eth` — under even the default 0.3 cutoff — while `word_similarity`, which scores the best matching extent *inside* the name, gives 0.60. A single box replacing three anchored inputs has to match mid-name, so `word_similarity` at a 0.45 threshold is what's implemented.

`GrailsListing` is not renamed. Adding a `source` column now would be a migration for a schema shape nothing needs until the OpenSea scrape happens.

## Build order

### 1. Query layer (`apps/api`)

No new columns. `nameLength` already exists and is all the length chips need; the character-class columns went with the chips that would have used them.

The dust floor and outlier ceiling need no columns either. They're plain `priceWei` range predicates at query time.

Extend `SearchFilters` and `GrailsService.search` with the new criteria, a `sort` param, and a `query` param. Add a grouped aggregate that returns per-chip counts so no chip leads to an empty result set. The counts are computed against every filter *except* the length group itself — counting through the group's own selection would make every unselected chip read zero the moment one was picked, which is exactly when the counts matter.

For fuzzy search, enable `pg_trgm` and add a GIN `gin_trgm_ops` index on `name` via a raw SQL migration. Prisma has no similarity operator, so do this in two steps rather than rewriting the filter builder as raw SQL: when a text query is present, run a raw query for candidate names ranked by `word_similarity($1, name)`, then pass them into the existing Prisma `where` as `name: { in: [...] }`. The threshold is set with `SET LOCAL` inside a transaction, so the `<%` operator can use the index while the threshold stays in code rather than leaking into pooled connection state.

That two-step caps how many names one query can reach (500). A broader query silently loses the least-similar remainder, so `total` for a text query counts candidates rather than the whole table — deliberately, because the number in the header has to be the number the user can actually page through.

Extend `GrailsController` with the new query params. `apps/web/app/api/ensv1/grails-listings/route.ts` forwards every incoming param as-is, so it needs no change.

### 2. Client hooks (`apps/web/lib/ensv1-client.ts`)

Extend `GrailsFilters` with the new criteria, sort and query, and surface chip counts on `GrailsListingsResult`. Delete `useEnsV1Listings` — the browse hook, along with its cursor-to-page-number bookkeeping. `useEnsV1ListingForName` keeps OpenSea alive on the detail page and is untouched.

### 3. Explore page (`apps/web/app/domains/page.tsx`)

Delete the Source block, `matchesFilters`, the `source` state, the `refine` URL param, and the `hasAppliedUrlMode` mount effect (which only exists because mode is global state the URL also tries to own — with the Source block gone and mode following the chain, nothing needs it).

Build the sidebar as: search box, then the length chips with counts, then sort, then the outlier toggle, then an Advanced disclosure holding the min/max ranges and anchored prefix/suffix. Keep the existing debounced URL sync and extend it to chips, sort and query so views stay shareable. Add an active-filter summary with a clear-all.

Typing is debounced; clicking isn't. A chip, sort or toggle change applies on the next tick while the text fields wait out the 400ms — one shared debounce would either fire a query per keystroke or put a visible lag behind every chip click.

The header count becomes an honest total now that filtering is fully server-side, replacing "N on this page · Grails has X listings total".

On mobile the filters move into a collapsible drawer instead of the current tall block that pushes the table below the fold.

### 4. Top nav (`apps/web/components/TopNav.tsx`)

No change. See the Decisions section — the existing chain selector already does this job, and the nav search box keeps its current exact-lookup behaviour.

### 5. Tests

`apps/api` had no test framework at all — CI only linted and built it — so the query layer gets one first. It's vitest against a real Postgres, not a faked `PrismaClient`: a fake can only assert the shape of the `where` object it was handed, which says nothing about whether the query selects the right rows, and trigram similarity and `Decimal(78,0)` comparisons have no behaviour outside the database. Locally the harness creates a throwaway cluster with `initdb` and destroys it afterwards; CI points `TEST_DATABASE_URL` at a `services: postgres` block. This is how the `similarity` vs `word_similarity` problem above surfaced.

`apps/web/cypress/e2e/ensv1-explore.cy.ts` asserts the behaviour being deleted, including a test named "has no merged 'All' option" and one for switching to OpenSea. Rewrite it against the new sidebar. The split with the api tests is deliberate: that a filter selects the right rows is proved against real SQL, so the Cypress specs assert the outgoing query params and the rendering instead of reimplementing the filtering in a stub. Both the `opensea-page1.json` and `grails-page1.json` fixtures become unused and go.

No other spec needs touching. `mobile-responsive.cy.ts` used to reach ENSv2 mode by clicking the sidebar's mock-marketplace button, but that assertion went when the mock did.

## Deferred

Scraping OpenSea listings into Postgres, which is what would let the feed aggregate both marketplaces with working filters. Everything else about a merged feed depends on it.

Theme tagging at ingest, which is what would make the nav's `Categories` placeholder real. Label each name once with `finance`, `gaming`, `cities`, `countries`, `first names` and so on, store it as a column, and themes become more chips with no query-time cost and fully auditable output. Cheap at this dataset size, and for a good share of the labels a wordlist join needs no model at all.

Natural language into filters, where a query like "4 letter names under 1 eth" is translated into the structured filter object the chips already produce, with the chips filling in visibly so the user can see and correct the interpretation.

Embedding similarity over names, so that `crypto exchange` surfaces `swap.eth` and `trade.eth`. Worth being clear that this is the weakest of the three deferred search features despite being the one that sounds most impressive: embeddings of bare single words with no surrounding context are mediocre, a large share of ENS names aren't words, and it puts unauditable fuzziness in the query path where theme tagging keeps it offline and correctable.

## Open

The dust floor and outlier ceiling are set to provisional round numbers — 0.001 ETH and 10,000 ETH — so the mechanism could be built and tested. They were picked, not measured, and still want checking against the real price distribution. They're two constants at the top of `GrailsService`, marked with a TODO.

Theme tagging is deferred (below), and with clubs and character-class chips cut, the sidebar now has exactly one chip group. If a second group is wanted before theme tagging lands, character class is the cheapest one to bring back — the grouping machinery already handles OR-within-group and AND-between-groups.

The Grails feed is now the only feed, so the "listings as of {last successful scrape}" disclosure that `grails-migration.md` flags as the honest thing to add once Grails' API dies is no longer optional. The feed is a snapshot of a marketplace that's shutting down, and it will keep getting staler.
