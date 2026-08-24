# DevTrack

**More than grades. Real progress.**

DevTrack is a Vercel-friendly Next.js platform for programming teachers and students. It combines teacher-assigned projects, GitHub activity, a per-project development diary, formative assessment, final assessment, teacher feedback, private AI-assisted code review and Deskplan attendance.

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
- JSON service/data layer
- local JSON storage in development
- private Vercel Blob JSON persistence in production
- GitHub App + REST API + signed push webhooks
- OpenAI Responses API
- Deskplan API adapter

## Quick start

```bash
cp .env.example .env.local
npm install
npm run dev
```

Demo password: `Demo123!` unless `DEVTRACK_DEMO_PASSWORD` is changed.

Demo accounts:

- Teacher: `teacher@devtrack.local`
- Student: `janis@devtrack.local`

## Production storage

Vercel does not provide durable writable local filesystem storage. `lib/storage.js` therefore uses:

- local development: `/data/*.json`
- production with `BLOB_READ_WRITE_TOKEN`: private Vercel Blob JSON documents

The service layer keeps business logic independent of the storage backend so PostgreSQL / Neon / Supabase can replace the JSON adapter later.

## Environment variables

```text
AUTH_SECRET
DEVTRACK_DEMO_PASSWORD
NEXT_PUBLIC_APP_URL
BLOB_READ_WRITE_TOKEN

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
- `/ai-reviews` requires teacher/admin role
- student UI contains no AI review navigation or AI scores
- GitHub repository access is read-only
- GitHub webhook payload is validated with `X-Hub-Signature-256`

Before school-wide production use, replace shared demo-password auth with per-user credentials or school SSO and move high-concurrency storage to PostgreSQL/Neon/Supabase.

## Deploy to Vercel

```bash
npm install
npm run build
```

Then push/import the repository in Vercel, configure Vercel Blob and environment variables, and set the GitHub App callback/webhook URLs to the production domain.
