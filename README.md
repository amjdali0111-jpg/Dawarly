# Dawarly · دوّرلي (FindIt)

AI-assisted, bilingual (Arabic/English), multi-university **lost & found** platform.
Students, staff and faculty report lost or found items, discover possible matches,
chat inside the platform, verify ownership privately and confirm the handover —
directly or through university security.

Design: **Campus After Dark** (dark navy + turquoise, campus-at-night hero with the
approved boy-and-girl illustration), RTL Arabic by default, responsive, installable PWA.

---

## Contents

- [Architecture](#architecture)
- [Features](#features)
- [Prerequisites](#prerequisites)
- [Getting started](#getting-started)
- [Environment variables](#environment-variables)
- [Supabase setup & migrations](#supabase-setup--migrations)
- [Administrator bootstrap](#administrator-bootstrap)
- [Scheduled jobs](#scheduled-jobs)
- [Testing](#testing)
- [Deployment (Vercel)](#deployment-vercel)
- [Security model](#security-model)
- [Known limitations & external dependencies](#known-limitations--external-dependencies)
- [Unresolved product decisions](#unresolved-product-decisions)
- [Team workstreams](#team-workstreams)

---

## Architecture

| Layer | Technology |
|---|---|
| Frontend | Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS, lucide icons |
| Backend | Next.js Server Components + Server Actions, route handlers for cron |
| Database | Supabase PostgreSQL with Row Level Security and `SECURITY DEFINER` workflow functions |
| Auth | Supabase Auth, **email confirmation required** |
| Storage | Supabase Storage, private buckets, short-lived signed URLs |
| Maps | OpenStreetMap + Leaflet (manual location entry always available) |
| AI | Configurable: OpenAI-compatible embeddings; Claude (Anthropic SDK) or OpenAI vision |
| Email | Configurable: Resend, console, or none |

```
src/
  app/                 routes (public, (auth), (app) protected, admin, api/cron)
  app/actions/         server actions (all writes; DB re-authorizes everything)
  components/          UI (reports, chat, map, admin charts, requests…)
  i18n/                ar.ts / en.ts dictionaries (type-checked parity), server + client helpers
  lib/matching/        bilingual text normalisation, scoring, AI providers, engine
  lib/email/           outbox dispatcher + localized templates
  lib/supabase/        browser / server (user session) / service-role clients
supabase/migrations/   versioned SQL (schema, RLS, workflows, storage, scheduling, realtime)
scripts/               admin bootstrap CLI, icon generator, local DB test harness
tests/unit|db|e2e/     Vitest unit tests, Postgres RLS/workflow tests, Playwright E2E
```

Key principle: **the database is the security boundary.** Clients only get `SELECT`
through RLS plus a few column-level writes; every state transition (create report,
renew, accept request, confirm handover, moderate, sanction…) is a `SECURITY DEFINER`
function that re-checks identity, role, university and state. Calling PostgREST
directly cannot bypass the rules.

## Features

- **Multi-university isolation** — every row carries `university_id`; users see only
  their university; university admins administer only theirs; global admins see all.
- **Auth** — register (choose university, member type; any email domain), email
  confirmation, login, forgot/reset password, logout. Roles are never client-supplied.
- **Reports** — one shared lost/found model with identical fields and rules:
  item name, description, category, color, distinguishing characteristics, location
  (typed text + optional map pin), date (required), time (optional), 1–5 photos.
  Exact coordinates and private verification notes live in `report_private`; others
  see a ~100 m approximate location. Owners edit, close, renew.
- **Moderation** — suspicious reports (contact details/links, scam wording, bursts,
  recently sanctioned authors, AI image flags) are held `under_review` until a
  university admin approves or removes them; every decision is audited.
- **Sensitive items** — category or keyword (AR/EN) or AI image signal routes the
  report to university security: photos hidden from non-staff, requests go to
  `security_review`, security staff are notified and can co-confirm the handover.
- **Search** — keyword search tolerant to Arabic letter variants with cross-language
  synonyms (e.g. “bag” finds “حقيبة”), filters for type, category, color, dates,
  location, status.
- **AI match suggestions** — embeddings + image analysis when configured, bilingual
  heuristic matching otherwise. Scores are *similarities* with reason codes
  (same category, color, close location, close dates, similar description/photos);
  never private details. Suggestions are shown in-app only — **no notification is
  sent when a match is found**. Users confirm a suggestion before requesting recovery.
- **Recovery requests** — multiple requesters per report, one open request per user,
  accept/reject by owner (or security for sensitive items), direct or security-assisted
  handover, **two-party confirmation** (never time-based), failed handovers, disputes.
- **Internal chat** — start from any report page (no request needed), text + photos,
  realtime updates, blocking, abuse reports; no phone/email exposure; admins can read
  a conversation only while handling an abuse report about it.
- **Expiry & renewal** — 14-day validity, idempotent expiry job, manual renewal
  (+14 days) by owner or university admin (audited).
- **Notifications** — in-app notifications with de-duplication keys; optional email
  outbox with atomic claiming, bounded retries and backoff.
- **Ratings** — only the item owner rates the finder, 1–5 stars + optional comment,
  only after both confirmations, once per recovery, visible only within the university.
- **Abuse & sanctions** — graduated response to confirmed false reports:
  warning → 7-day restriction → 14-day restriction + escalation. No permanent bans.
- **Admin** — review queue, report detail with private info and audit trail, users
  (roles, restrictions), categories, abuse, disputes, security workspace, analytics,
  audit log; global admins manage universities and see per-university analytics.
- **Account deletion** — see [Unresolved product decisions](#unresolved-product-decisions).
- **PWA** — manifest, icons, offline page, a service worker that caches only public
  static assets (never pages, APIs, auth or private files).

## Prerequisites

- Node.js ≥ 20 (tested with 22) and npm
- A Supabase project (or the Supabase CLI + Docker for a local stack)
- For the DB test-suite: local PostgreSQL ≥ 15 binaries (`initdb`, `pg_ctl`, `psql`)

## Getting started

```bash
npm install
```

```bash
cp .env.example .env.local   # then fill in your Supabase URL/keys
```

Apply the database migrations (see below), create a university and an admin, then:

```bash
npm run dev
```

Open http://localhost:3000.

## Environment variables

All variables are documented in [`.env.example`](.env.example). Summary:

| Variable | Required | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | Public |
| `SUPABASE_SERVICE_ROLE_KEY` | yes (server) | Matching, email outbox, cron, account deletion, bootstrap. **Never** expose to the client |
| `NEXT_PUBLIC_SITE_URL` | yes | Used in auth email links |
| `CRON_SECRET` | yes for cron | ≥ 16 random chars |
| `AI_EMBEDDING_PROVIDER`, `AI_EMBEDDING_MODEL`, `OPENAI_API_KEY`, `OPENAI_BASE_URL` | optional | OpenAI-compatible embeddings |
| `AI_VISION_PROVIDER` (`anthropic`/`openai`/`none`), `AI_VISION_MODEL`, `ANTHROPIC_API_KEY` | optional | Image analysis |
| `EMAIL_PROVIDER` (`resend`/`console`/`none`), `RESEND_API_KEY`, `EMAIL_FROM` | optional | Email copies of notifications |
| `NEXT_PUBLIC_MAP_TILE_URL`, `NEXT_PUBLIC_DEFAULT_MAP_CENTER` | optional | Map tiles / fallback centre |

## Supabase setup & migrations

Migrations live in `supabase/migrations/` and are applied in filename order.

**Hosted project (recommended):**

```bash
npx supabase link --project-ref <your-project-ref>
```

```bash
npx supabase db push
```

(Or paste each migration file, in order, into the SQL editor.)

Then in the Supabase dashboard:

1. **Authentication → Providers → Email**: enable *Confirm email*.
2. **Authentication → URL configuration**: set *Site URL* to your deployed URL and add
   `https://<your-domain>/auth/confirm` to the redirect allow-list.
3. **Authentication → Email templates**: use the templates in `supabase/templates/`
   (they link to `/auth/confirm?token_hash=…&type=…`). Configure custom SMTP for production.
4. **Database → Extensions**: enable `pg_cron` (the scheduling migration then registers
   the expiry job automatically; re-run `20261029000005_scheduling.sql` if you enable it later).
5. **Database → Replication**: the realtime migration adds `messages` to the
   `supabase_realtime` publication (chat falls back to polling otherwise).

**Local stack:** `npx supabase start` then `npx supabase db reset` applies the
migrations and the **development-only** `supabase/seed.sql` (two example universities,
no users or reports). The seed is never applied by `db push`.

## Administrator bootstrap

There is **no HTTP endpoint** for creating administrators. An operator runs a local
CLI with the service-role key; every change is written to the audit log.

```bash
npm run bootstrap:admin -- university --slug ksu --name-en "King Saud University" --name-ar "جامعة الملك سعود" --lat 24.716 --lng 46.619
```

The future administrator registers normally and confirms their email, then:

```bash
npm run bootstrap:admin -- promote --email admin@example.com --role global_admin
```

Afterwards the global admin manages universities and promotes university admins
from the web UI (`/admin/users`, `/admin/universities`); university admins can only
grant `security` / `user` within their university. Remove the service-role key from
any machine that no longer needs it.

## Scheduled jobs

| Job | Endpoint / mechanism | Notes |
|---|---|---|
| Report expiry | `pg_cron` every 15 min **and/or** `GET /api/cron/expire` | Idempotent; running both is safe |
| Email outbox | `GET /api/cron/notifications` (+ kicked after each mutating action) | Retries ×3 with backoff |
| AI retry sweep | `GET /api/cron/matching` | Re-processes reports whose AI step failed |

Cron endpoints require `Authorization: Bearer $CRON_SECRET`. `vercel.json` schedules
them daily (the Vercel Hobby limit); on Vercel Pro shorten the schedules, or call
the endpoints from any scheduler. Chat-message emails are sent by the next outbox run.

## Testing

```bash
npm run lint          # ESLint (zero warnings)
npm run typecheck     # tsc --noEmit
npm run test:unit     # Vitest: matching, validation, retries/fallback, email, i18n parity, SW policy…
npm run test:db       # creates a throw-away Postgres cluster, applies migrations, runs RLS/workflow tests
npm test              # unit + db
npm run build
npm run test:e2e      # Playwright (desktop + mobile) against `next start` of the production build
```

`test:db` (`scripts/test-db.sh`) emulates the parts of Supabase the migrations use
(`auth.users`, `auth.uid()`, API roles and default privileges, `storage.objects`) and
runs every query as a real `authenticated` user with JWT claims, so RLS and grants are
exercised exactly as through PostgREST. It covers cross-university isolation, direct
table/RPC bypass attempts, role escalation, report validation and lost/found parity,
the 1–5 photo rule, sensitive routing, moderation holds, expiry/renewal idempotency,
multiple requests, two-party and security-assisted handovers, disputes, ratings
eligibility/uniqueness/visibility, chat and attachment access, blocking, graduated
sanctions, notification de-duplication and email retries, storage policies, audit
logging and account deletion.

The E2E suite covers the public surface: hero + both report actions + **no report
feed on the homepage**, RTL/LTR switching, redirects for every protected route,
cron endpoint protection, auth pages and PWA (manifest, icons, SW registration,
no-cache SW). Authenticated browser flows need a running Supabase stack (see limitations).

## Deployment (Vercel)

1. Import the repository in Vercel (framework: Next.js).
2. Add the environment variables from `.env.example` (service-role key and secrets
   as *server-only* variables — never prefixed with `NEXT_PUBLIC_`).
3. Set `NEXT_PUBLIC_SITE_URL` to the production URL and update Supabase auth URLs.
4. Deploy. Crons from `vercel.json` are registered automatically.
5. Run the [administrator bootstrap](#administrator-bootstrap) once.

## Security model

- Email-confirmed users only: `my_university_id()` returns `NULL` for unconfirmed or
  deleted accounts, so RLS shows them nothing.
- Users cannot change `role`, `university_id`, report `status`, ownership or
  restrictions — enforced with column-level grants, not just UI.
- Storage paths encode the university and uploader; policies check both, and report
  photos are readable only when the report (and, for sensitive items, the viewer's
  role or accepted request) allows it.
- Match explanations are reason codes; verification notes are never embedded or shown.
- Error messages are mapped from stable codes; raw database errors are never shown.
- Emails contain no item details or personal data, only a link to the app.
- Audit log: moderation, renewals by admins, role changes, restrictions, security
  actions, recovery transitions, disputes, configuration changes, account deletion.
  Chat contents are never logged.
- The service worker never caches HTML, API, auth responses or signed file URLs.

## Known limitations & external dependencies

- **External credentials needed**: Supabase project (URL, anon key, service-role key),
  SMTP for auth emails in production, optionally OpenAI/Anthropic keys and a Resend key.
- **End-to-end tests of authenticated flows** (register → confirm email → report →
  match → chat → handover) need a live Supabase stack; in the development sandbox used
  to build this project Docker images could not be pulled, so those flows are covered by
  the database test-suite (all business rules) plus unit tests, not by browser tests.
- The AI matcher evaluates up to 300 recent candidates per report (±60 days) in the
  application layer; for very large universities consider `pgvector` and an index.
- Orphaned photo uploads (photos uploaded but the form abandoned) are not yet
  garbage-collected; a storage cleanup job is a suggested follow-up.
- OpenStreetMap's public tile servers have a usage policy; heavy production use should
  point `NEXT_PUBLIC_MAP_TILE_URL` at a dedicated tile provider.
- The hero illustration is extracted from the approved mockup at modest resolution;
  replace `public/images/hero-characters.webp` with the original high-resolution
  artwork when available.
- Social login (Google/Microsoft buttons seen in the mockup) is not implemented, since
  email confirmation was specified as the verification method.

## Unresolved product decisions

These were deliberately **not** invented:

1. **Account deletion with open items.** How to handle a deleting user's open reports,
   outstanding recovery requests and historical ratings is undefined. The implemented
   behaviour is a guard, not a policy: self-service deletion is **refused** (with an
   explanation) while the user has open/under-review/expired reports, in-progress
   requests, or any ratings given/received. When none exist, the auth account (email)
   is deleted, avatar files removed, notifications/blocks/settings dropped, and the
   profile row anonymised ("Deleted user") so other users' histories stay intact.
   Backups held by Supabase are not erased immediately.
2. **Expiry of reports that are mid-handover.** Reports expire on schedule regardless of
   accepted requests; an accepted handover can still be confirmed after expiry. Whether
   expiry should pause during handover is open.
3. **Notification for match confirmations.** No notification is sent when a match is
   found (as specified); whether the *other* owner should be notified when one side
   confirms a suggestion is undecided (currently: no).

## Team workstreams

| # | Workstream | Main paths |
|---|---|---|
| 1 | Frontend, design, navigation, bilingual | `src/app/page.tsx`, `src/components/`, `src/i18n/`, `tailwind.config.ts` |
| 2 | Database, auth, authorization, isolation | `supabase/migrations/0001–0002`, `src/lib/auth.ts`, `src/middleware.ts`, `tests/db/isolation*` |
| 3 | Reports, search, storage, maps | `src/app/(app)/reports/`, `src/lib/search.ts`, `src/components/map/`, `0004_storage` |
| 4 | AI matching, requests, chat, handover | `src/lib/matching/`, `src/app/(app)/{matches,requests,messages}`, `0003_workflows` |
| 5 | Admin, moderation, notifications, testing, deployment | `src/app/admin/`, `src/lib/email/`, `src/app/api/cron/`, `tests/`, this README |

Shared contracts: the SQL function signatures in `0003_workflows.sql`, the types in
`src/lib/types.ts`, and the error-code ↔ translation table (`errors.*` in `src/i18n`,
checked by a unit test).
