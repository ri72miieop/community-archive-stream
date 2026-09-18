# Community Archive Stream

This repo is for docs, bugs, and suggestions for the Community Archive Stream browser extension, which intercepts some tweets as you view them and adds them to the [Twitter Community Archive](http://community-archive.org/) open database

Install it from the [Chrome Web Store](https://chromewebstore.google.com/detail/community-archive-stream/igclpobjpjlphgllncjcgaookmncegbk).

This is a [Plasmo extension](https://docs.plasmo.com/) project bootstrapped with [`plasmo init`](https://www.npmjs.com/package/plasmo).

## Getting Started

First, make sure you have a valid local environment of [Community Archive](https://github.com/ri72miieop/community-archive/blob/main/docs/local-setup.md) running.

Then make sure you have the .env file properly set. After that run the development server:

```bash
pnpm dev
# or
npm run dev
```

Open your browser and load the appropriate development build. For example, if you are developing for the chrome browser, using manifest v3, use: `build/chrome-mv3-dev`.

You can start editing the popup by modifying `popup.tsx`. It should auto-update as you make changes. To add an options page, simply add a `options.tsx` file to the root of the project, with a react component default exported. Likewise to add a content page, add a `content.ts` file to the root of the project, importing some module and do some logic, then reload the extension on your browser.

For further guidance, [visit our Documentation](https://docs.plasmo.com/)

## Context companion (draft)

This branch adds a native right-side companion with contextual archive results,
an Explore area for CA's five discovery tools, private reading-history search,
and a seven-day attention view. Explore includes author/community bangers,
published digests with sources, trends with an inspectable chart, archive text
search, and a traversable graph neighborhood. The detailed
[design and release boundaries](memos/20260917-1619-community-archive-companion-design.md)
describe implemented behavior and follow-ups.

Preview the UI locally, without accounts or external services:

```bash
pnpm preview:companion
# Open http://127.0.0.1:4177 — all tweets are labeled sample data.
```

Build and load the unpacked Chrome extension with the project's existing public
Supabase configuration, OAuth redirect, and firehose settings. Chrome 116+ is
required. The new private-history migration must first be promoted through the
main CA repository's schema/migration workflow into the same Supabase project.
The migration here is a reviewed candidate, not a standalone Supabase project.
No hosted database is changed by building or previewing this branch.

Click Archive on X (or Open companion in the toolbar popup), connect your CA
account through Account settings, and enable Private reading history in Controls.
Firehose contribution is a separate setting. Pausing history preserves existing
memories; deleting history pauses collection and clears cloud history and this
device's pending buffer. Other devices reject/discard stale queued observations
when they reconnect. A changed extension ID needs an allowed OAuth redirect.

Private records contain rendered tweet text, author, seen timestamps, page type,
and visible duration. They use owner-only PostgreSQL RLS and are separate from
public archive ingestion. The local outbox retries for at most 24 hours / 1,000
observations. On-screen time is an approximate signal, not proof of reading.

Focused checks (Bun and local PostgreSQL binaries are required):

```bash
pnpm test:companion
pnpm test:reading-db
pnpm build
```

The DB check creates and destroys an isolated local database; it never connects
to a hosted Supabase project. Public archive cards use the existing website
search endpoint and degrade gracefully when unavailable or rate limited.

## Shared website features

Explore uses `/api/companion/v1/{bangers,digest,trends,search,graph}` on CA. The
website adapter reuses existing ranking, published editions, trend evidence,
graph snapshots, and archive search. Release that API before this extension;
an unreleased endpoint is shown as unavailable rather than sample content.
Trends sends the reader's Supabase access token for server validation. Public
feature reads send no token, viewing durations, or private-history records.

`companion/archive-contract.ts` is generated from the website's canonical
`src/lib/companion/contract.ts`, with a SHA-256 source marker. To sync/check:

```sh
node scripts/sync-companion-contract.mjs /path/to/CA/src/lib/companion/contract.ts
node scripts/sync-companion-contract.mjs /path/to/CA/src/lib/companion/contract.ts --check
```

Context follows the visible/pinned tweet; Explore holds its selected subject
until the reader chooses another or clicks Use current tweet. Automatic
bangers/digest suggestions are debounced and spaced at least 12 seconds apart.
Requests are deduplicated and cached for two minutes, with a 40-entry bound
and 429/5xx cooldown. Media and quote payloads are preserved in result cards.
Live stream, conversation maps/strands, opportunities, profiles, apps, and
account/archive settings have website entry points in the Explore menu.

The preview's data is fictional. Before release, verify real sign-in, all five
API shapes, rate limits, and real X context with a configured staging build.
