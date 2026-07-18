# Canopy 🌿

A beautiful document editor — elegant alternative to Notion.

## Setup

### 1. Supabase
The application expects an existing Supabase schema. The local `supabase/migrations`
directory contains incremental migrations only; it is not currently a complete
bootstrap schema for a blank project. Export and version the production schema
before relying on this repository for disaster recovery.

Review and apply `docs/supabase-security-hardening.sql` to restrict privileged
database helper functions. It is deliberately not applied automatically because
the repository does not contain the complete live schema.

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
npm run build
npm audit --omit=dev
```

## Features (Phase 1)
- Rich Markdown editor with live preview (edit / split / preview modes)
- Images, links, tables, YouTube embeds
- Folder organization
- Document sharing (view/edit permissions + link sharing)
- Google OAuth + email/password
- Auto-save
