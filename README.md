# DevTrack

**More than grades. Real progress.**

DevTrack is a Vercel-friendly Next.js platform for programming teachers and students. It combines projects, GitHub activity, code browsing, commit analytics, teacher feedback, configurable assessment, AI code review and Deskplan attendance into one developer-style workspace.

## Stack

- Next.js 16 App Router + React 19
- JavaScript
- CSS (custom SaaS design system)
- Vercel Serverless Route Handlers
- JSON service/data layer
- Local JSON storage in development
- Vercel Blob JSON persistence in production
- GitHub App + REST API + signed push webhooks
- OpenAI Responses API structured review
- Deskplan API adapter

## Quick start

```bash
cp .env.example .env.local
npm install
npm run dev
```

Open `http://localhost:3000`.

Demo password: `Demo123!` unless `DEVTRACK_DEMO_PASSWORD` is changed.

Demo accounts:

- Teacher: `teacher@devtrack.local`
- Student: `janis@devtrack.local`

## Production storage

A Vercel deployment cannot use its local filesystem as durable writable storage. DevTrack therefore keeps storage behind `lib/storage.js`:

- local development: `/data/*.json`
- Vercel: the same JSON documents stored as private Vercel Blob objects when `BLOB_READ_WRITE_TOKEN` is configured

This keeps the MVP JSON-first and allows the storage adapter to be replaced later with PostgreSQL / Neon / Supabase without rewriting UI or business logic.

Create a private Vercel Blob store and connect it to the Vercel project. The `BLOB_READ_WRITE_TOKEN` environment variable is then available to the app.

## Environment variables

See `.env.example`.

Required before production:

```text
AUTH_SECRET
DEVTRACK_DEMO_PASSWORD
NEXT_PUBLIC_APP_URL
BLOB_READ_WRITE_TOKEN
```

For GitHub:

```text
GITHUB_APP_ID
GITHUB_APP_SLUG
GITHUB_CLIENT_ID
GITHUB_CLIENT_SECRET
GITHUB_PRIVATE_KEY
GITHUB_WEBHOOK_SECRET
```

For AI:

```text
OPENAI_API_KEY
OPENAI_MODEL
```

For Deskplan:

```text
DESKPLAN_API_URL
DESKPLAN_API_KEY
```

## GitHub App setup

Create a GitHub App in GitHub Developer Settings.

Recommended repository permissions:

- Metadata: read (implicit)
- Contents: read

Subscribe to:

- `push`

Webhook URL:

```text
https://YOUR_DOMAIN/api/webhooks/github
```

Webhook secret must equal `GITHUB_WEBHOOK_SECRET`.

Setup / callback URL:

```text
https://YOUR_DOMAIN/api/github/callback
```

The app is read-only. DevTrack does not request permission to push, edit or delete repository content.

`services/github.js` creates short-lived installation tokens server-side. GitHub secrets and private keys are never exposed to the browser.

## GitHub repository linking

The MVP contains the GitHub App installation route and repository API. A production UI can use:

```text
GET /api/github/install?projectId=project_001
GET /api/github/repos?installationId=...
```

After selecting a repository, save `githubOwner`, `githubRepo`, `defaultBranch` and `githubInstallationId` through the project service/admin flow. Demo projects intentionally render realistic repository data before a real repository is linked.

## GitHub webhook security

`/api/webhooks/github` validates `X-Hub-Signature-256` with HMAC SHA-256 and `GITHUB_WEBHOOK_SECRET` before parsing/storing a payload.

Only `push` is processed by the MVP. Stored history is deduplicated by commit SHA.

## OpenAI setup

Configure `OPENAI_API_KEY` and optionally `OPENAI_MODEL`.

Teachers can run AI review from a project workspace. The server collects:

- assignment requirements
- repository tree
- selected code files
- recent commit history

The OpenAI call returns a strict JSON schema containing architecture, code quality, security, database, Git workflow, documentation, positives, issues, recommendations and suggested points.

AI points are a recommendation only. The teacher remains responsible for the final assessment.

If no OpenAI key is configured, the seeded demo project uses the demo review so the interface remains testable.

## Deskplan setup

`services/deskplan.js` is an isolated adapter. Set the API base URL and API key, then adapt the endpoint/response mapping to the concrete Deskplan API contract if it differs from:

```text
GET /students/:deskplanUserId/attendance
```

DevTrack treats Deskplan as the attendance source of truth and stores only a synchronized snapshot for display and risk analysis.

## Architecture

```text
app/
  api/
  dashboard/
  students/
  projects/
  groups/
  attendance/
  ai-reviews/
  assessments/
components/
  AppShell.js
  DashboardViews.js
  ProjectWorkspace.js
  Charts.js
  UI.js
lib/
  auth.js
  http.js
  page.js
  storage.js
services/
  analytics.js
  assessments.js
  deskplan.js
  feedback.js
  github.js
  openai.js
  projects.js
  users.js
data/
  users.json
  groups.json
  projects.json
  commits.json
  attendance.json
  feedback.json
  assessments.json
  aiReviews.json
  auditLogs.json
```

## Security notes

- All third-party secrets remain server-side.
- Auth session is a signed JWT stored in an HttpOnly, SameSite=Lax cookie.
- Production cookies use `Secure`.
- API routes perform authentication and role checks.
- Project/file access checks prevent a student from opening another student's project through the API.
- GitHub webhook signatures are validated before the payload is trusted.
- Repository access is read-only.
- OpenAI review runs only on explicit teacher action in the MVP.
- Replace the shared demo-password login with school SSO / per-user password credentials before a real school rollout.
- Add CSRF protection for sensitive cookie-authenticated write operations before internet-wide production use if cross-site flows are introduced.

## Assessment

Seeded example criteria:

- Program functionality 0–5
- Code quality 0–5
- Git usage 0–3
- Security 0–2
- Documentation 0–5
- Presentation 0–5

Grade mapping is stored in `data/settings.json` and is therefore replaceable/configurable.

## Risk model

The MVP marks students from signals such as:

- attendance below 60%
- no Git activity for more than 14 days
- moderate inactivity / attendance warnings

Risk indicators are informational and never set the final grade.

## Deploy to Vercel

```bash
npm install
npm run build
```

Then:

1. Push this folder to GitHub.
2. Import the repository in Vercel.
3. Connect a private Vercel Blob store.
4. Add environment variables.
5. Deploy.
6. Configure the GitHub App callback and webhook URLs to the deployed domain.

## Next production steps

The included code is a complete functional MVP foundation. Before a school-wide deployment, the most important upgrades are per-user/SSO authentication, a PostgreSQL adapter for higher write concurrency, real Deskplan endpoint mapping, a repository-selection form after GitHub App installation, admin CRUD for users/groups/projects, and automated tests around authorization and webhook handling.
