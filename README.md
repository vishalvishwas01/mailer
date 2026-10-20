# Mailer

Private single-user email outreach workspace built with Next.js, TypeScript, MongoDB/Mongoose, OpenAI, and Gmail OAuth.

## Local setup

1. Install Node.js compatible with the version required by Next.js 16.
2. Install dependencies with `npm install`.
3. Copy `.env.example` to `.env.local` and fill in real values. Never commit `.env.local`.
4. Configure a MongoDB database and Google OAuth client. Add `http://localhost:3000/api/auth/google/callback` as an authorized redirect URI for local development.
5. Set `APP_PASSWORD` to a long unique password. Set `SESSION_SECRET` and `CRON_SECRET` to separate random secrets, each at least 32 characters. Set `GOOGLE_TOKEN_ENCRYPTION_KEY` to 64 hexadecimal characters (32 bytes).
6. Start the app with `npm run dev`, then sign in at `/login`.

## Environment variables

- `MONGODB_URI`: MongoDB connection string.
- `OPENAI_API_KEY`: server-side OpenAI key for generating drafts.
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`: Google OAuth configuration.
- `GOOGLE_TOKEN_ENCRYPTION_KEY`: 32-byte hex key used to encrypt OAuth tokens at rest.
- `APP_PASSWORD`: single-user application login password.
- `SESSION_SECRET`: HMAC key for signed login sessions.
- `CRON_SECRET`: secret used to authenticate scheduled worker requests. Use a different value from `SESSION_SECRET`.

Generate independent random secrets locally, for example with `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"`. Generate the token encryption key with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`.

## Scheduled processing

`vercel.json` schedules:

- `/api/email-worker` every minute. Each run can process at most one queue item; the schedule window, interval, daily limit, approved-draft state, persistent reservation, and unique send records are checked before delivery.
- `/api/replies/poll` every 15 minutes. It checks recent Gmail threads for replies and stores discovered messages.

Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` when `CRON_SECRET` is configured in the deployment environment. The endpoints reject requests without the secret. Scheduled sending is disabled until you enable it in the schedule settings. Only queue drafts that have been reviewed and approved.

The scheduler uses the logical sending window as the daily limit period, including overnight windows that cross midnight. Gmail acceptance is recorded as `sent`; uncertain provider outcomes are recorded as `unknown` and are not automatically retried.

## Security notes

- All application pages and API routes are protected by a signed, HTTP-only session cookie except the login endpoint and static assets. Set the three application security variables above before use.
- OAuth access and refresh tokens are encrypted at rest. Keep all keys server-side and rotate any credential that was ever committed or exposed.
- Do not commit contact lists, resumes, OAuth tokens, `.env.local`, or real recipient data. The repository's example data files should contain synthetic data only.
- Keep the scheduler disabled until credentials and Gmail permissions are configured and the workflow has been tested with a controlled recipient.
- This project does not guarantee inbox delivery. Gmail's send response only confirms acceptance by Gmail, not recipient delivery.


## AI instructions and email templates

Open **AI & Templates** from the dashboard to edit the OpenAI system instructions and manage email templates. Both are stored in MongoDB. The system instructions are initialized with the application's default prompt the first time settings are opened; subsequent edits are used for future generated drafts. Existing drafts are not rewritten. Templates can be created and edited on the same page, and support `{{name}}`, `{{email}}`, `{{company}}`, and `{{website}}` placeholders.
