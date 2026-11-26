# Earthwork · Tech Jobs

A public tech jobs board focused on Canadian roles, remote US roles, and US employers with sponsorship evidence. Applications go to the employer site. The board is served from committed data so it remains usable while the previous Neon database is over quota.

## Jobs shown

- Restored Canadian technology roles from the October 2, 2026 employer snapshot. These are historical listings: check the employer link before applying.
- Active software, data, AI, product, quant, hardware, security, and related technology listings from the Simplify new-grad and Summer 2027 internship GitHub repositories.
- Simplify listings are limited to Canada and the United States. Canada comes first, then remote US, then US roles marked by Simplify as offering sponsorship, then roles at employers with another Simplify posting marked as offering sponsorship or published company sponsorship guidance, then other US roles.
- A company history or a Simplify sponsorship flag does not guarantee sponsorship for a specific application. Roles marked no sponsorship or US citizenship required remain labelled accordingly. Canadian roles are prioritized for this workspace because the owner does not need Canadian work authorization.
- Microsoft is the first company with separate primary-source sponsorship evidence: its [university internship FAQ](https://careers.microsoft.com/v2/global/en/universityinternship) says it provides visa sponsorship. Its US roles are ranked as company-known, but each role remains unconfirmed. The evidence is maintained in `data/us-sponsor-evidence.json`; a role's explicit no-sponsorship or citizenship restriction always overrides company evidence.
- Company tech stack is displayed as `Not known as of now` unless the restored October employer posting explicitly described its stack. No stack is guessed from a job title.
- Past unambiguous application deadlines are hidden. The old employer snapshot is not independently rechecked in static mode.

Sources: [Simplify new-grad](https://github.com/SimplifyJobs/New-Grad-Positions) and [Simplify / Pitt CSC internships](https://github.com/SimplifyJobs/Summer2027-Internships). The structured `.github/scripts/listings.json` files on their `dev` branches provide active status, category, location, posting date, and sponsorship flags. Attribution is shown on the site.

## Independent refresh

[GitHub Actions](.github/workflows/refresh-jobs.yml) runs [scripts/sync-simplify.mjs](scripts/sync-simplify.mjs) daily at **5 p.m. America/Toronto** and polls every 15 minutes between daily checks. It does not use a ChatGPT automation or the old Neon-backed all-company collector. When the normalized data changes, the workflow commits `data/simplify-jobs.json` to `main`; the existing Vercel Git integration deploys that commit. GitHub scheduled jobs may start late, so updates are eventual rather than instantaneous. The workflow needs repository Actions to be enabled and permission for GitHub Actions to write to `main`.

The former all-employer collector remains in the repository for historical reference but is not scheduled. The October snapshot is not refreshed until an independent, bounded employer collector is added.

## Deployment and access

The existing Vercel project is `earthwork-jobs`, connected to this repository's `main` branch. Static mode is the default. The production build skips database bootstrap, avoiding the Neon quota error. The job board, job details, and source list are public. Maintenance endpoints and every write still require the server-only `UPDATER_SECRET` bearer token. Do not commit that value.

Static mode does not persist category corrections or refresh-run history. Résumé matching remains local to the browser. Users should treat résumé data entered on a shared device as visible to other users of that browser profile.

## Local checks

Use Node.js 24 and pnpm 11.25.0. Run `pnpm install --frozen-lockfile`, `node scripts/verify-simplify.mjs`, `pnpm check`, and `pnpm build`. To try the sync against fixture files without network access, set `SIMPLIFY_INPUT_DIR` to a directory containing `new-grad.json` and `internships.json`, and `SIMPLIFY_OUTPUT` to a writable output path.

Production deployments should be checked for a successful build, direct public access, job pagination, priority labels, details, blocked unauthenticated maintenance requests, and the next GitHub Actions sync.
