# Earthwork · Canada Jobs

A private Canadian jobs dashboard with an earthy, minimal interface, real application links, category and location filters, relevance search, salary/date sorting, and a scripted Monday refresh. No OpenAI API key or AI service is required. Applications are submitted by you on the employer's website.

## Included data

`data/earthwork-snapshot.json.gz` is a complete database export from October 2, 2026: 1,603 job records, 1,801 careers sources, category overrides, first/last seen dates, four refresh runs, and settings. Full employer descriptions are included. It contains no account credentials. Listings are Canadian or explicitly Canada-eligible remote roles; future openings/talent pools and eligibility caveats are labelled. 1,512 application pages were reachable in the latest refresh; 91 retain their initial verification because a later source check was incomplete. A reachable page alone does not prove an employer is still reviewing applications.

## Deploy to Vercel

1. Import this private GitHub repository into the intended Vercel team. Use the repository root, Next.js framework and Node.js 24.
2. Connect a Neon Postgres database through Vercel Marketplace. Set its connection string as server-only `DATABASE_URL`.
3. Set `APP_PASSWORD` (unique, at least 16 characters), `SESSION_SECRET` and a separate `UPDATER_SECRET` (random, at least 32 characters each). Set them in Production and Preview; keep preview isolated from production data if developing changes. Never expose these values through `NEXT_PUBLIC_*` or commit them.
4. Link locally with `vercel link`, then pull the production environment with `vercel env pull .env.production.local --environment=production`. Confirm the correct project/team before running database commands.
5. Run `corepack pnpm install --frozen-lockfile`, `node --env-file=.env.production.local scripts/migrate-db.mjs` and `node --env-file=.env.production.local scripts/seed-db.mjs`. The import preserves existing records; use it for the initial migration. It resets schedule status to pending until the first new scheduled run succeeds.
6. Deploy through the Git integration or `vercel --prod`. Sign in with the workspace password. Verify that anonymous `/api/jobs` returns 401, authenticated jobs/details load, category correction persists, and filters/sorts work.

The app denies job/data access unless a valid owner session or updater bearer secret is present. Owner sessions use signed, secure, HttpOnly cookies; changing the workspace password invalidates them. Login attempts are limited in Postgres. The existing hosted site and its schedule should remain active until this migration is verified.

## Monday refresh

The committed GitHub Actions workflow runs Mondays at **6 p.m. America/Toronto**, including daylight-saving changes, and supports **Run workflow** manually. Long crawling runs happen on GitHub Actions; Vercel serves the frontend and short database/API requests.

Add these repository Actions secrets:

| Secret | Value |
|---|---|
| `EARTHWORK_SITE_URL` | Your stable production Vercel origin, e.g. `https://your-project.vercel.app` |
| `EARTHWORK_UPDATER_SECRET` | Exactly the server's `UPDATER_SECRET` |
| `VERCEL_AUTOMATION_BYPASS_SECRET` | Optional Vercel protection bypass secret if Deployment Protection blocks the automation URL |

Enable Actions, then run the workflow manually and verify its results in **Refresh & coverage** before retiring the old schedule. Schedule configuration is committed, but activation requires these secrets and a successful deployment/run. GitHub may delay scheduled runs.

The Python collector uses public Ashby, Greenhouse, Lever, Workable and Workday feeds and employer job metadata. It discovers additional ATS links, checks individual application pages, extracts supplied dates and compensation, and reports incomplete checks. In direct mode, owner/updater credentials are sent only to your Earthwork API; public employer requests never receive them. Set `PUBLIC_FETCH_MODE=proxy` only if the server-side allowlisted public-fetch fallback is needed.

## Closed postings and classification

- A known, unambiguous deadline hides the job immediately when the dashboard loads and archives it during refresh. Date-only deadlines remain open through the Toronto calendar day; yearless/ambiguous dates are preserved.
- Employer-confirmed closure hides a job during refresh. A missing role is archived after two successful source checks. Temporary website/network errors preserve existing roles and are flagged for review.
- Categories use role-title rules, employer departments and reviewed corrections in `lib/reviewed-categories.ts`. Your manual category correction takes precedence and survives refreshes.
- Highest compensation ranks the upper end of published annual ranges converted to CAD using Bank of Canada rates. It does not invent missing salaries or compare hourly pay with annual salary. Check the employer posting for commission and equity terms.

## Development and checks

Use Node.js 24 and pnpm 11.25.0. Copy `.env.example` to `.env.local` and set the server environment, migrate/seed a separate development Neon database, then `corepack pnpm dev`. To run the collector locally use `SITE_ORIGIN` and `UPDATER_SECRET` from a secure environment, then `python scripts/refresh_jobs.py`. `--source ashby:cohere` checks one registered source; `--limit 5` checks a bounded subset.

Run `corepack pnpm check`, `python scripts/verify_collector.py`, and `corepack pnpm build`. The checks cover real-data filter results, relevance/date/salary ordering, deadline boundaries, private access, password/session revocation, SQL parameters, and public-request credential isolation. Database and deployed end-to-end checks require configured resources.

An authenticated `GET /api/migration-export` returns all persisted jobs, sources, runs and settings for future backup or migration. Keep exports private. Runtime job changes live in Postgres; they do not require Git commits. Source code changes on `main` redeploy through Vercel's Git integration once connected.
