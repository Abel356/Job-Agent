# Earthwork · Global Jobs

A private jobs dashboard with an earthy, minimal interface, international location and employer-stated sponsorship filters, real application links, relevance search, salary/date sorting, and a scripted Daily refresh. Canada is the initial country filter; Clear all includes every country. No OpenAI API key or AI service is required. Applications are submitted by you on the employer's website.

## Included data

`data/earthwork-snapshot.json.gz` is a complete database export from October 2, 2026: 1,603 job records, 1,801 careers sources, category overrides, first/last seen dates, four refresh runs, and settings. Full employer descriptions are included. It contains no account credentials. Listings are Canadian or explicitly Canada-eligible remote roles; future openings/talent pools and eligibility caveats are labelled. 1,512 application pages were reachable in the latest refresh; 91 retain their initial verification because a later source check was incomplete. A reachable page alone does not prove an employer is still reviewing applications.

## Deploy to Vercel

1. Import this private GitHub repository into the intended Vercel team. Use the repository root, Next.js framework and Node.js 24.
2. Connect a Neon Postgres database through Vercel Marketplace. Set its connection string as server-only `DATABASE_URL`.
3. Set `APP_PASSWORD` (unique, at least 16 characters), `SESSION_SECRET` and a separate `UPDATER_SECRET` (random, at least 32 characters each). Set them in Production and Preview; keep preview isolated from production data if developing changes. Never expose these values through `NEXT_PUBLIC_*` or commit them.
4. Link locally with `vercel link`, then pull the production environment with `vercel env pull .env.production.local --environment=production`. Confirm the correct project/team before running database commands.
5. Production builds run `scripts/bootstrap-db.mjs` before Next.js: it verifies required server environment keys, applies the schema, and imports the complete snapshot once. A persisted completion marker prevents later deployments from reimporting data or resetting the schedule. If an initial import fails, its next build resumes safely while preserving already imported rows. Preview and local builds do not initialize a database automatically. To initialize a separate local database, run `node --env-file=.env.local scripts/migrate-db.mjs` and `node --env-file=.env.local scripts/seed-db.mjs`.
6. Deploy through the Git integration or `vercel --prod`. Sign in with the workspace password. Verify that anonymous `/api/jobs` returns 401, authenticated jobs/details load, category correction persists, and filters/sorts work.

The app denies job/data access unless a valid owner session or updater bearer secret is present. Owner sessions use signed, secure, HttpOnly cookies; changing the workspace password invalidates them. Login attempts are limited in Postgres. The existing hosted site and its schedule should remain active until this migration is verified.

## Daily refresh

The committed GitHub Actions workflow runs daily at **12 p.m. America/Toronto**, including daylight-saving changes, and supports **Run workflow** manually. Long crawling runs happen on GitHub Actions; Vercel serves the frontend and short database/API requests.

Add these repository Actions secrets:

| Secret | Value |
|---|---|
| `EARTHWORK_SITE_URL` | Optional override; defaults to `https://earthwork-jobs.vercel.app` |
| `EARTHWORK_UPDATER_SECRET` | Exactly the server's `UPDATER_SECRET` |
| `VERCEL_AUTOMATION_BYPASS_SECRET` | Optional Vercel protection bypass secret if Deployment Protection blocks the automation URL |

Enable Actions, then run the workflow manually and verify its results in **Refresh & coverage** before retiring the old schedule. Schedule configuration is committed, but activation requires these secrets and a successful deployment/run. GitHub may delay scheduled runs.

The Python collector uses public Ashby, Greenhouse, Lever, Workable and Workday feeds and employer job metadata. It discovers additional ATS links, checks individual application pages, extracts supplied dates and compensation, and reports incomplete checks. In direct mode, owner/updater credentials are sent only to your Earthwork API; public employer requests never receive them. Set `PUBLIC_FETCH_MODE=proxy` only if the server-side allowlisted public-fetch fallback is needed.

## Company discovery and international coverage

- Production bootstrap idempotently registers the 321 Speedrun company profiles discovered on October 14, 2026, its directory, and all 500 companies in the 2026 Fortune 500 public directory. These are tracked sources, not a claim that 821 companies currently have accessible jobs. Existing records are preserved.
- Every full Daily refresh paginates Speedrun's public directory across all cohorts and registers new profiles. Profile pages provide official employer websites; official careers links lead to supported ATS boards. The Fortune roster is dated 2026 and sourced from the public SheetSteps directory linked to Fortune company profiles. Public Fortune Company Information resolves official websites; saved websites are reused. Rankings and subscription content are not imported.
- New employers found in JobPosting metadata and new ATS links in opportunities are persisted immediately. Discovery uses canonical website/board identities, not employer name alone. Jobs are retained across countries; job location is distinct from headquarters. Unclear locations remain unspecified.
- Every failed employer source receives a final bounded Ashby lookup using name, case and slug variants. A healthy feed must pass an employer-identity check (registered official domain, or matching name plus an official-site backlink). A verified replacement preserves the original source ID, records the prior issue, and is used in later refreshes. Remaining application-link failures stay flagged. No verified replacement means the failure remains visible with the attempts recorded. UUID-only unknown names cannot be safely guessed.
- The October 14 Ashby recheck covers all 308 saved failures. Production bootstrap applies its repair/history data only when the source URL, original check timestamp and error are unchanged and no newer fallback exists. Verified boards are labelled awaiting refresh; these probes do not import jobs or mark a complete refresh. Subsequent builds leave updated records alone.
- The job list and existing-job state are paginated. Refresh writes are bounded batches; only the final batch advances coverage and missing-job checks. Large official ATS JSON feeds can be read up to 25 MB in direct mode; other pages remain limited to 5 MB.
- Filters include country, explicit US sponsorship, general sponsorship (offered, unavailable, conditional, unknown), internships/co-ops, entry-level/new-grad, OPT/CPT mentions, remote geography, and stated citizenship/permanent-residency/clearance requirements. Evidence appears in job details. Missing or contradictory sponsorship wording remains unclear. Generic sponsorship on a multi-country role does not establish US sponsorship.
- Labels describe employer wording, not immigration advice or a guarantee of eligibility. Canadian work authorization does not grant US work authorization. Remote work for a US employer from Canada is a separate location/employment question. OPT/CPT refers to US student programs.

### Deadline and classification rules

- A known, unambiguous deadline hides the job immediately when the dashboard loads and archives it during refresh. Date-only deadlines remain open through the Toronto calendar day; yearless/ambiguous dates are preserved.
- Employer-confirmed closure hides a job during refresh. A missing role is archived after two successful source checks. Temporary website/network errors preserve existing roles and are flagged for review.
- Categories use role-title rules, employer departments and reviewed corrections in `lib/reviewed-categories.ts`. Your manual category correction takes precedence and survives refreshes.
- Highest compensation ranks the upper end of published annual ranges converted to CAD using Bank of Canada rates. It does not invent missing salaries or compare hourly pay with annual salary. Check the employer posting for commission and equity terms.

## Development and checks

Use Node.js 24 and pnpm 11.25.0. Copy `.env.example` to `.env.local` and set the server environment, migrate/seed a separate development Neon database, then `corepack pnpm dev`. To run the collector locally use `SITE_ORIGIN` and `UPDATER_SECRET` from a secure environment, then `python scripts/refresh_jobs.py`. `--source ashby:cohere` checks one registered source; `--limit 5` checks a bounded subset.

Run `corepack pnpm check`, `python scripts/verify_collector.py`, and `corepack pnpm build`. The checks cover real-data filter results, relevance/date/salary ordering, deadline boundaries, private access, password/session revocation, SQL parameters, and public-request credential isolation. Database and deployed end-to-end checks require configured resources.

An authenticated `GET /api/migration-export` returns all persisted jobs, sources, runs and settings for future backup or migration. Keep exports private. Runtime job changes live in Postgres; they do not require Git commits. Source code changes on `main` redeploy through Vercel's Git integration once connected.


## Focused filters and direct major-employer sources

Career-stage version 2 checks title and explicit description evidence for new graduates, including university-grad wording and zero-to-two-year requirements. Senior titles and mentoring references do not qualify. Cached version 1 records are reclassified from their stored descriptions when read. Engineering disciplines support multiple selections; company collections (Fortune 500, Speedrun, major employers) and ATS groups narrow a searchable multi-company picker, with zero-import companies clearly labelled.

Dedicated collectors use Amazon's public careers search (US/Canada, paginated), Tesla's public careers index and job details (US/Canada), and Meta's public job sitemap plus JobPosting metadata (global). Amazon's 10,000-result cap or failed details mark coverage incomplete and preserve existing listings. A small live-verified initial sample is imported once without overwriting existing jobs; it is not full employer coverage. Daily refresh runs at noon Toronto time after the GitHub updater secret is configured. No AI service is used.

