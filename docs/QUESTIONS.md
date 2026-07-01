# Questions you probably have

A quick FAQ for anyone reviewing this project — the "why is it built this way" questions. The deep reasoning is in [ARCHITECTURE.md](ARCHITECTURE.md); this is the fast version, with links where a section goes further.

**Why CoinCap and not CoinGecko (or something else)?** Free tier, plain bearer-token REST, and it covers everything the brief needs (top coins + per-coin history) with no paid gating. Its quirks — string numerics, no logos, percentage-only 24h change — are covered in [External API](ARCHITECTURE.md#external-api), and the provider's isolated behind `services/coincap.ts` so swapping it is contained.

**Why keep the coin data in two tables (`Coin` and `PriceHistory`)?** They answer two different questions. `Coin` holds one upserted row per coin — the latest snapshot — so the dashboard is a trivial 20-row lookup that doubles as the last-known-good cache when upstream's down. `PriceHistory` is an append-only time series read by range for the detail chart. Merge them and the hot dashboard query has to dig each coin's latest row out of an ever-growing history table.

**Why does `PriceHistory` have fewer fields than `Coin`?** It only stores what changes tick-to-tick and gets charted: price (and volume when we have it). The rest — symbol, name, rank, 24h % — describes the coin _now_, not at some past minute, so copying it onto every row would just bloat the series with redundant, historically-meaningless data. (The backfill endpoint only returns price + time anyway.)

**Why a relational database?** Tabular data, simple range/lookup queries, and reviewable Prisma migrations matter more here than the write-scale a NoSQL store buys — which at 20 coins / 30s we don't need. Full reasoning in [the schema section](ARCHITECTURE.md#database-schema-serverprismaschemaprisma).

**Why not delete old/irrelevant history?** `PriceHistory` is append-only and I deliberately dropped the age-based prune. At this scale — tens of coins, one row each per 30s — the table grows slowly and the detail view already reads a bounded time window, so old rows don't hurt correctness or speed. At real scale you'd reach for time-series partitioning, a TTL, or downsampling rather than a `DELETE` after every poll.

**Why keep `FetchLog` around at all?** So freshness (`live`/`stale`/`error`) is derived from real fetch attempts instead of guessed from `Coin.updatedAt` — see [FetchLog status lifecycle](ARCHITECTURE.md#database-schema-serverprismaschemaprisma). Also will be easier to extract the write logic to external service without damaging the freshness calculation.

**How do you tell "actually stale" from "the connection just went quiet"?** Two independent signals — server-side `FetchLog` status, and a client wall-clock watchdog that forces the REST fallback — so a silently-stalled socket can't fake liveness. See [Handling upstream failure](ARCHITECTURE.md#handling-upstream-failure).

**Why poll every 30s — why isn't it real-time?** Nothing upstream is fresher than the poll, so 30s _is_ the real data cadence and SSE pushes each snapshot the moment it lands; it also stays well under the rate limit (see [Rate limits and caching](ARCHITECTURE.md#rate-limits-and-caching)) and it's one env var to change.

**Does opening an SSE stream per browser tab hurt scaling?** Client connections fan out but upstream cost stays flat — one shared poll feeds everyone (see [Keeping data fresh](ARCHITECTURE.md#keeping-data-fresh-single-shared-poll-loop--sse-not-per-request-calls-or-websockets)), so one user and a thousand generate identical CoinCap traffic; each client is just a cheap top-20 DB read.

**How is the CoinCap API key kept off the client?** The frontend never calls CoinCap directly — hard rule, the browser only ever hits our own Express API. The key lives only in server-side env, goes out as a bearer token from the server, and is kept out of the logs.

**What would you change for real production?** The items in [Known limitations / future work](ARCHITECTURE.md#known-limitations--future-work): move the refresh/backfill into its own writer service, put a Redis read cache in front of the dashboard query, add multi-provider failover, and ship a leaner runtime image.
