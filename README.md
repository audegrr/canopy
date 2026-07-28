# Canopy 🌿

A beautiful document editor — elegant alternative to Notion.

## Setup

### 1. Supabase
The application expects an existing Supabase schema. The local
`supabase/migrations` directory contains incremental migrations. Generate or
refresh the complete recovery snapshot from the linked project with:

```bash
npm run backup:schema
```

Privileged database helpers are restricted by
`supabase/migrations/017_privileged_function_grants.sql`; keep that migration in
every restored environment.

See [`docs/OPERATIONS.md`](docs/OPERATIONS.md) for backup, restoration, deployment,
access and incident procedures.

### 2. Deploy to Vercel
1. Push this project to a GitHub repository
2. Vercel → New Project → import your repo
3. Add the environment variables documented in `.env.example`. Keep
   `SUPABASE_SERVICE_ROLE_KEY`, `GROQ_API_KEY`, `RESEND_API_KEY`, and
   `VAPID_PRIVATE_KEY` server-only.
4. Deploy!

### 3. Configure Supabase redirect URLs
In Supabase → Authentication → URL Configuration:
- Site URL: https://your-app.vercel.app
- Redirect URLs: https://your-app.vercel.app/auth/callback

## Local development

```bash
cp .env.example .env.local
npm install
npm run dev
```

## Verification

```bash
npm run lint
npm run check:english
npm test
npm run build
npm run check:bundle
npm audit --omit=dev
```

## Features (Phase 1)
- Rich Markdown editor with live preview (edit / split / preview modes)
- Images, links, tables, YouTube embeds
- Folder organization
- Document sharing (view/edit permissions + link sharing)
- Google OAuth + email/password
- Auto-save
