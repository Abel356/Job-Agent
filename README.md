# Earthwork · Tech Jobs

A tech jobs board without an application password, focused on Canadian roles, remote US roles, and US employers with sponsorship evidence. Applications go to the employer site. The board is served from committed data so it remains usable while the previous Neon database is over quota.

## Jobs shown

- Current technology roles from selected employer career boards, checked daily where a public feed is available.
- Restored Canadian technology roles from the October 2, 2026 employer snapshot where no current employer feed has replaced them. These are historical listings: check the employer link before applying.
- Active software, data, AI, product, quant, hardware, security, and related technology listings from the Simplify new-grad and Summer 2027 internship GitHub repositories.
- Simplify listings are limited to Canada and the United States. Canada comes first, then remote US, then US roles marked by Simplify as offering sponsorship, then roles at employers with another Simplify posting marked as offering sponsorship or published company sponsorship guidance, then other US roles.
- A company history or a Simplify sponsorship flag does not guarantee sponsorship for a specific application. Roles marked no sponsorship or US citizenship required remain labelled accordingly. Canadian roles are prioritized, but each visitor must check their own work authorization.
- Microsoft is the first company with separate primary-source sponsorship evidence: its [university internship FAQ](https://careers.microsoft.com/v2/global/en/universityinternship) says it provides visa sponsorship. Its US roles are ranked as company-known, but each role remains unconfirmed. The evidence is maintained in `data/us-sponsor-evidence.json`; a role's explicit no-sponsorship or citizenship restriction always overrides company evidence.
- Company tech stack is displayed as `Not known as of now` unless the restored October employer posting explicitly described its stack. No stack is guessed from a job title.
- Past unambiguous application deadlines are hidden. The old employer snapshot is not independently rechecked in static mode.

Sources: [Simplify new-grad](https://github.com/SimplifyJobs/New-Grad-Positions) and [Simplify / Pitt CSC internships](https://github.com/SimplifyJobs/Summer2027-Internships). The structured `.github/scripts/listings.json` files on their `dev` branches provide active status, category, location, posting date, and sponsorship flags. Attribution is shown on the site.

Employers can [submit a tech role](app/submit-job/page.tsx) for review. The form opens the sender's email app with the role details; submission does not automatically publish a listing.

## Independent refresh

[GitHub Actions](.github/workflows/refresh-jobs.yml) runs [scripts/sync-simplify.mjs](scripts/sync-simplify.mjs) daily at **5 p.m. America/Toronto** and polls every 15 minutes between daily checks. It does not use a ChatGPT automation or the old Neon-backed all-company collector. When the normalized data changes, the workflow commits `data/simplify-jobs.json` to `main`; the existing Vercel Git integration deploys that commit. GitHub scheduled jobs may start late, so updates are eventual rather than instantaneous. The workflow needs repository Actions to be enabled and permission for GitHub Actions to write to `main`.

[GitHub Actions](.github/workflows/refresh-employers.yml) also runs [scripts/sync-employers.mjs](scripts/sync-employers.mjs) daily at **5 p.m. America/Toronto**. It selects up to 100 employer boards from the Canadian tech snapshot, priority Simplify roles, and the reviewed [employer source list](data/employer-sources.json), then reads public Ashby, Greenhouse, Lever, and SmartRecruiters feeds. Add an employer board to that list as `{"name":"Company","url":"https://jobs.ashbyhq.com/company"}` after checking its identity. It keeps only technology titles in Canada, remote US roles, and US roles with sponsorship evidence. The generated `data/employer-jobs.json` is committed to `main` only when roles or source status change, which triggers the same Vercel deployment. A failed source retains its prior jobs; a missing job is removed only after two successful checks. Sudden large drops and unusually broad imports stop publication. Employer jobs take precedence over duplicate Simplify or historical listings.

The former database-backed all-employer collector remains in the repository for historical reference but is not scheduled. Workday and careers-page fallback support remain in that collector and are not yet part of the bounded static feed. The employer submission form requires an email application on the sender's device.

## Deployment and access

The existing Vercel project is `earthwork-jobs`, connected to this repository's `main` branch. Static mode is the default. The production build skips database bootstrap, avoiding the Neon quota error. The job board, job details, and source list require no application password. Vercel Authentication is a separate project setting and may still require a Vercel sign-in. Maintenance endpoints and every write require the server-only `UPDATER_SECRET` bearer token. Do not commit that value.

Static mode does not persist category corrections or refresh-run history. Google sign-in uses Auth.js encrypted, stateless sessions and requires `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, and `AUTH_SECRET` in Vercel production. Configure a Google OAuth Web client with redirect URI `https://earthwork-jobs.vercel.app/api/auth/callback/google` and publish its consent screen. The board remains public without signing in.

Confirmed matching preferences are encrypted in browser storage using an account-specific key. Résumé files and pasted text are processed only in the browser and are never uploaded. Profiles do not sync across devices; there is no profile database or storage bill. The previous unscoped browser profile is deleted on first visit under this version to prevent shared-browser disclosure. Signing out hides the profile; a signed-in visitor can remove it from the matching tab. Rotating `AUTH_SECRET` invalidates sessions and makes saved local profiles unreadable.

## Local checks

Use Node.js 24 and pnpm 11.25.0. Run `pnpm install --frozen-lockfile`, `node scripts/verify-simplify.mjs`, `pnpm check`, and `pnpm build`. To try the sync against fixture files without network access, set `SIMPLIFY_INPUT_DIR` to a directory containing `new-grad.json` and `internships.json`, and `SIMPLIFY_OUTPUT` to a writable output path.

Production deployments should be checked for a successful build, direct public access, job pagination, priority labels, details, blocked unauthenticated maintenance requests, and the next GitHub Actions sync.
