# Community Archive companion design

## Executive summary

Make the archive useful at the moment someone is curious. The extension should help a reader place the current tweet in context, recover things they have seen, and reflect on where their time went. A native browser panel keeps the timeline usable and gives private history an extension-owned UI, outside the Twitter document.

The implementation extends **community-archive-stream**, preserving its XHR interception, endpoint parsers, identity handling, and firehose transport. It adds Context, Explore, Memory, Attention, and independent controls for cloud history and firehose contribution. Private history belongs to the signed-in CA account from the start, as requested. No paid model or new hosted service is required.

The code and an interactive preview are ready for review. The new database migration is supplied alongside the feature, **not applied to a hosted database**. The preview uses fictional sample tweets. Release to users still requires migration promotion into the main CA repository, configured extension builds, and an authenticated staging smoke test.

## What should the sidebar know?

| Reader's question | Information to show | First version / next step |
| --- | --- | --- |
| What is this connected to? | Related archive posts with an explanation of the match | Implemented: bounded keyword matches through the existing public search endpoint; clearly labeled as lexical matches |
| Have I seen this idea before? | Related tweets from my private reading history | Implemented: full-text matches and earlier posts by the same author |
| Who is this person, over time? | Their recurring questions, strongest earlier writing, and how a position developed | Earlier personally seen posts now; richer public author timelines are a follow-up |
| What is the missing backstory? | Reply ancestors, quoted sources, earlier versions of an argument | Follow-up: use CA conversation data with explicit missing-context states |
| Where was that tweet? | Search by remembered words or author | Implemented: account-scoped search across saved history, with original links |
| What held my attention? | Distinct tweets, on-screen time, authors, and a seven-day pattern | Implemented with a visible explanation of measurement limits |
| What do I want more of? | Saved questions, chosen interests, revisits, and a personal digest | Follow-up; let the user choose the direction before adding model inference |
| Who else is exploring this? | Public participants in related conversations, with linked evidence | Follow-up; don't imply friendship or agreement from proximity |

Lead with Context. Memory is the durable utility that becomes more valuable with use. Attention is a reflective view, not another engagement score or a psychological profile. Avoid presenting a confident summary when the archive contains only a fragment of a conversation.

## Interaction

- A small Archive button on X opens the native panel. The browser toolbar popup provides another entry point and a link to account settings.
- The visibly central tweet supplies context. Pin holds it while the reader scrolls. Focusing the panel stops time measurement without removing the current tweet.
- Public archive cards and private memories have distinct provenance labels and link to their original sources. Empty and unavailable states are explicit.
- Public context requests are debounced, bounded to four results, cached for five minutes, and put on cooldown after service errors. They send a keyword to CA search, not the private history or dwell-time records.
- The panel is designed for Chrome 116+ on desktop. A user can set the browser's panel side; right-side placement is the intended layout. Firefox native-sidebar support is not implemented in this change.

## What counts as seen?

An observation requires at least half of a tweet to remain visible for 1.5 seconds in a focused, visible tab. A long tweet can qualify by occupying half of the viewport. Sampling is once per second. Background tabs, timer-suspension gaps, and time after 60 seconds without activity don't accumulate duration. DMs, chat, settings, login, account, and compose routes are excluded.

The collector extracts rendered tweet text, an author, tweet ID, page category, timestamps, and cumulative visible milliseconds. It does not collect cookies, DMs, screenshots, search-query URLs, or raw API responses for private history. Quoted status links must not replace the parent tweet's identity. Media-only posts retain their identity with empty text; media contents and hidden/truncated text are not downloaded by this path.

This is **observed exposure**, not proof of reading, agreement, interest, or comprehension. Two visible tweets each accrue time, so the sum is not elapsed browsing-session time. Briefly glimpsed tweets and network-prefetched tweets are deliberately not counted. This version makes no claim to perfectly capture every impression.

## Account-backed storage and consent

The new PostgreSQL tables are `private_reading_preferences` and `private_reading_events`. Ownership uses the Supabase Auth UUID, not a Twitter handle or client-editable metadata. Private requests bind their JWT to the selected account; destructive controls also check the account shown in the panel, so an account switch cannot redirect a clear or export. RLS restricts reads and writes to the owner; anonymous API access is revoked. RPCs run as the caller, with a fixed search path. Account deletion cascades to this data.

Cloud saving requires sign-in and an explicit Enable private history action. It is independent of public firehose contribution. Fresh installations default firehose contribution off; saved choices on existing installations remain respected. Firehose data keeps its existing wire format and server-side archive-policy checks. The private-history path never submits its records to the firehose or to analytics.

A separate extension-origin IndexedDB outbox handles temporary failures. It is bound to the account and consent epoch, capped at 1,000 observations and 24 hours, and retried with an MV3 alarm. This is an offline buffer; PostgreSQL is the durable history. If consent cannot be refreshed, new collection pauses rather than assuming permission indefinitely. The cap bounds local storage, so extended offline use can lose observations. The UI reports pending sync and failures. Devices must be online to learn a changed server preference; stale epochs are nevertheless rejected server-side.

Ingestion uses stable observation IDs and the maximum cumulative duration, so retries do not double-count time. Pause and clear rotate a consent epoch. Ingestion locks the preference row while writing; clear pauses the account and deletes history under the same transaction. Old queues cannot repopulate history after resume. Delete clears this device's buffer immediately; other devices discard their old buffer at the next successful sync.

History is kept until the user deletes it; there is no implied retention expiry for the cloud database. Pause & export drains this device's queue, pauses account collection, and paginates all cloud events with a stable key. Other devices' unsynced observations are excluded. App access is private to the account, but this is not end-to-end encryption against CA database operators or someone with access to the local browser profile.

## Deployment boundary

### Shared website features

Explore now contains compact versions of bangers, digest, trends, search, and graph. Bangers switches between the current author's curated profile and community rankings, with pagination. Digest shows published stories with expandable sources and date selection. Trends has an inspectable chart, raw/normalized values, interval selection, and evidence posts. Search supports phrases, the current author, and pagination. Graph lets a reader traverse a bounded neighborhood and continue on the website with that person selected.

Context also suggests earlier author bangers and a relevant published digest story. These optional reads are debounced and spaced at least 12 seconds apart. Explore holds the reader's selected subject while the timeline changes; Use current tweet explicitly resets it. Stream, conversation maps/strands, bulletin, directory, apps, and archive settings remain website entry points in the compact menu.

The website's `/api/companion/v1/{feature}` adapters reuse existing CA services. A single browser-safe contract is maintained in the website, with a generated, checksum-checked extension copy. Installed extensions validate response shapes, deduplicate requests, bound their cache, and cool down after rate limits or upstream errors. Public requests carry a topic/handle; only authenticated trends carries a session token. Private reading history never enters this API.

The API was deployed to production on September 17, 2026 via [website PR #991](https://github.com/TheExGenesis/community-archive/pull/991), commit `a69e0161b579d02e2e6af23672480f4e6606335a`. Actual staging OAuth and authenticated Trends checks remain release gates for the extension.

The extension repository includes an additive migration and disposable PostgreSQL tests. Promote the reviewed migration into the main `community-archive` repository's canonical migration/schema workflow before release; it targets the existing CA Supabase project, not a separate service. The extension's `supabase/` directory is not a complete standalone project.

Creating a migration PR in the main CA repository currently triggers a shared staging reset. This change therefore does not silently create that PR or apply the migration. No production database, firehose policy, public export, ClickHouse projection, or store listing was changed. The new private tables must stay out of public exports and analytical ingestion.

The initial fixture browser build used placeholder credentials and a local server. A subsequent unpacked build uses the production public Supabase configuration, with private collection and contribution off. A configured staging build still needs sign-in, authenticated Trends, cross-device sync, pause/delete, and signed-in X timeline checks before release. The unpacked extension ID must be allowed by the existing OAuth redirect configuration; the browser demo does not establish that compatibility.

### Production API rollout and live browser check

- Production deployment: `dpl_Acd7LXGE3gfBj9HKeGLKQLdgSQRR`, READY with `www.community-archive.org` assigned; build duration about 90 seconds.
- Previous production deployment remains the rollback target: `dpl_FsizH6DJVSxNiQTMNxgQevNYq7Bj` (`community-archive-3jxw5yd5c-theexgenesis-projects.vercel.app`), commit `1f719c281d820eb73ee01161c44a88dd659eb312`. The API is additive and has no database migration dependency.
- The installed extension returned six real author bangers, five published digest stories, six search results, and eight graph neighbors through its production messaging/client path. Production Trends returned JSON 401 with `private, no-store` when unauthenticated. No runtime errors were reported for the companion route during this check.
- A native Chrome side panel displayed the published digest beside a real, signed-out X post. X's alternate public layout required a conservative DOM fallback: only its leading article, with author/permalink agreement and its own visible text, qualifies. Eight browser regression cases cover identity, quotes, replies, visibility, private routes, and the existing signed-in markup.
- A plain CLI request encountered Vercel's browser checkpoint; the successful live checks used the actual extension browser. No protection was disabled.
- The hosted private-history migration is still unapplied. It adds two new tables, three indexes, owner policies and four caller-privilege RPCs; it performs no backfill or changes to existing archive tables. Collection defaults off. Cloud records remain until deletion and are not end-to-end encrypted.

## Validation

- The expanded companion has 13 focused tests (45 assertions), including response validation, credential isolation, caching, cooldown, link safety, and the earlier observation checks. The website adapters, graph deep link, and rate-limit boundaries pass 30 focused tests; website type-check and scoped lint pass.
- Browser checks exercise bangers pagination, digest expansion, trend inspection, graph traversal, author-filtered search, and a 360px panel without horizontal overflow. All five feature messages were exercised in the actual unpacked extension with intercepted fixture responses; oversized inputs and unapproved UI senders were rejected. Production API data was not used for these passing checks.

- Focused visibility tests cover brief exposure, foreground/background transitions, suspension gaps, duplicate rendered tweets, route exclusions, and schema validation.
- An isolated real PostgreSQL instance verifies retries, search, account isolation, anonymous denial, owner reassignment denial, pause/resume/clear epochs, and account-deletion cascades.
- The Plasmo Chrome build succeeds. The whole-project TypeScript check still reports pre-existing errors in InterceptorDashboard, x-tweets, and observable; new companion code has no reported errors.
- Browser checks exercise the actual shared React component with clearly labeled fixtures. The unpacked extension was also loaded in a persistent test browser: a local X fixture verified parent/quote identity, foreground capture, the durable queue, sync and memory retrieval through a fixture backend, a rejected wrong-account delete, and the original MAIN-world interceptor.
- One read-only check of the live archive search returned HTTP 429. No repeated live queries or corpus validation were performed; the implementation handles this as unavailable context with cooldown.

## References

- [Chrome Side Panel API](https://developer.chrome.com/docs/extensions/reference/api/sidePanel)
- [Supabase row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Private history migration](../supabase/migrations/20260917230433_private_reading_history.sql)
- [Extension implementation](../companion/)
