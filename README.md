# DevTrack

**More than grades. Real progress.**

DevTrack is a Vercel-friendly Next.js platform for programming teachers and students. It combines teacher-assigned projects, GitHub activity, a per-project development diary, formative assessment, final assessment, teacher feedback, private AI-assisted code review, Deskplan attendance and live school timetables.

## Core teaching workflow

1. Teacher opens **Assignments**.
2. Creates a project once for a group: title, full task, requirements, technologies, start date, deadline and final rubric.
3. DevTrack automatically creates one student project instance for every student in the selected group.
4. Student opens the assigned project and links their own GitHub repository.
5. The GitHub App installation is reused for the student's future projects; each project only needs a repository selection. If a new repository is not visible, **Manage GitHub access** lets the student add it to the existing GitHub App installation.
6. Every project has a **Project Diary**.
7. Teacher can announce a formative assessment once at Assignment level. The title, date, description and criteria become visible to every student immediately.
8. Teacher grades the group from one screen. Saving a student's result immediately publishes that student's score, criterion breakdown and feedback into their project diary.
9. Teacher feedback is also shown chronologically in the same diary.
10. Final assessment stays separate and uses the Assignment rubric.

Student navigation intentionally contains no AI pages, AI scores or AI-generated labels. AI review is a private teacher/admin tool only.

## Student project workspace

Student tabs:

- Overview — assignment, requirements and final rubric
- Diary — announced formative assessments, formative results and teacher feedback
- Code — read-only GitHub repository browser
- Commits — Git history
- Progress — activity charts and contribution heatmap
- Assessment — teacher-controlled final result

The student dashboard also surfaces recent project diary updates so newly announced formative assessments and newly published results are visible without opening every project.

## Private teacher review

Teacher/admin users can run a private code review. The server sends structured evidence to the configured OpenAI API:

- assignment description
- requirements
- final rubric
- selected repository files
- recent Git history
- formative assessment history for that student
- existing teacher feedback

The result is never exposed to students. It is an internal teacher aid and never sets the final grade automatically.

## Stack

- Next.js 16 + React 19
- JavaScript
- Vercel Serverless Route Handlers
- Neon PostgreSQL + Drizzle for accounts, groups, memberships and access control
- local JSON storage in development and private Vercel Blob persistence for the remaining feature data
- GitHub App + REST API + signed push webhooks
- OpenAI Responses API
- Deskplan API adapter

## Quick start

```bash
cp .env.example .env.local
npm install
npm run dev
```

The teacher signs in with `DEVTRACK_TEACHER_EMAIL` (defaults to
`toms.ricards@vtdt.edu.lv`) and the initial `DEVTRACK_TEACHER_PASSWORD`. After
sign-in, change the password in **Settings → Change password**. The saved
password is hashed and takes precedence over the bootstrap environment value.

## Production storage

Vercel does not provide durable writable local filesystem storage. The remaining JSON-backed features use:

- local development: `/data/*.json`
- production with `BLOB_READ_WRITE_TOKEN`: private Vercel Blob JSON documents

Accounts and groups switch automatically to Neon only after the school and imported memberships exist. Before initialization they continue using JSON/Blob. Once Neon is live, its transactional rows are authoritative and a background snapshot keeps the legacy Blob documents available as a recovery copy.

## Neon database foundation

The first PostgreSQL migration contains the multi-school and access-control foundation:

- users with a platform-level `super_admin` role
- schools and school memberships (`school_admin`, `teacher`, `student`)
- groups and membership relations
- a module catalog with school-wide and per-membership visibility overrides
- role permissions and per-membership allow/deny overrides
- audit logs for future administrative actions

DevTrack uses the pooled connection for short serverless reads and the unpooled connection for transactional migrations and account/group writes. The Vercel/Neon integration variable names shown below are supported directly; no secret value belongs in git.

```text
DEVTRACK_DATABASE_URL
DEVTRACK_DATABASE_URL_UNPOOLED
```

For local maintenance, provide those values privately in `.env.local`, then run:

```bash
npm run db:check
npm run db:migrate
```

`db:migrate` applies committed migrations and seeds the module/permission catalog. It is intentionally not part of `npm run build`: production schema changes should be an explicit operation. The Settings page has a credential-safe connection check that reports only connection state, schema readiness and latency.

The owner-only **Initialize & import** action in Settings performs the explicit production operation without exposing Vercel credentials. It serializes concurrent runs with a PostgreSQL advisory lock, applies pending migrations transactionally, and copies the current Blob-backed users and groups into Neon. Existing IDs, password hashes and integration profile fields are preserved. The import is idempotent and never deletes Blob data. After a successful import, Neon automatically becomes the live account/group source; Blob snapshots continue in the background and do not delay form responses.

`DEVTRACK_CORE_STORAGE` is optional: `auto` (default) activates Neon only after initialization, `blob` is an emergency rollback switch, and `neon` requires the database to be ready and fails closed when it is unavailable.

## Environment variables

```text
AUTH_SECRET
DEVTRACK_TEACHER_EMAIL
DEVTRACK_TEACHER_PASSWORD
NEXT_PUBLIC_APP_URL
BLOB_READ_WRITE_TOKEN

DEVTRACK_DATABASE_URL
DEVTRACK_DATABASE_URL_UNPOOLED
DEVTRACK_CORE_STORAGE
DEVTRACK_SCHOOL_ID
DEVTRACK_SCHOOL_NAME
DEVTRACK_SCHOOL_SLUG

GITHUB_APP_ID
GITHUB_APP_SLUG
GITHUB_CLIENT_ID
GITHUB_CLIENT_SECRET
GITHUB_PRIVATE_KEY
GITHUB_WEBHOOK_SECRET

OPENAI_API_KEY
OPENAI_MODEL

DESKPLAN_API_URL
DESKPLAN_API_KEY

TIMETABLE_API_URL
TIMETABLE_TEACHER_NAME
```

## GitHub App

Recommended repository permissions:

- Metadata: read
- Contents: read

Subscribe to:

- push

Webhook URL:

```text
https://YOUR_DOMAIN/api/webhooks/github
```

Setup / callback URL:

```text
https://YOUR_DOMAIN/api/github/callback
```

The app is read-only. DevTrack does not request permission to push, edit or delete student repository content.

After the first student installation, `githubInstallationId` is persisted on the student and copied to that student's unlinked projects. Future group assignments inherit the same installation automatically. A separate repository is still selected for every project.

## Data model additions

```text
Assignment
  id
  groupId
  description
  requirements[]
  technologies[]
  rubric[]
  startDate
  deadline

Project
  assignmentId
  studentId
  githubInstallationId
  githubOwner
  githubRepo

FormativeAssessment
  assignmentId
  title
  date
  description
  criteria[]
  results[]

FormativeResult
  studentId
  scores[]
  positive
  improvement
  feedback
  publishedAt
```

## Security

- third-party secrets remain server-side
- signed HttpOnly session cookie
- role checks on API and pages
- students cannot open another student's project
- AI review endpoint requires teacher/admin role
- student UI contains no AI review navigation or AI scores
- GitHub repository access is read-only
- GitHub webhook payload is validated with `X-Hub-Signature-256`

Before school-wide production use, consider school SSO and move high-concurrency storage to PostgreSQL/Neon/Supabase.

## Deploy to Vercel

```bash
npm install
npm run build
```

Then push/import the repository in Vercel, configure Vercel Blob and environment variables, and set the GitHub App callback/webhook URLs to the production domain.
