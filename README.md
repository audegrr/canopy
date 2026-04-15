# Canopy 🌿

A beautiful document editor — elegant alternative to Notion.

## Setup

### 1. Supabase — Create tables
Go to your Supabase project → SQL Editor → paste SUPABASE_SCHEMA.sql → Run.

### 2. Deploy to Vercel
1. Push this project to a GitHub repository
2. Vercel → New Project → import your repo
3. Add environment variables:
   - NEXT_PUBLIC_SUPABASE_URL
   - NEXT_PUBLIC_SUPABASE_ANON_KEY
4. Deploy!

### 3. Configure Supabase redirect URLs
In Supabase → Authentication → URL Configuration:
- Site URL: https://your-app.vercel.app
- Redirect URLs: https://your-app.vercel.app/auth/callback

## Local development
npm install && npm run dev

## Features (Phase 1)
- Rich Markdown editor with live preview (edit / split / preview modes)
- Images, links, tables, YouTube embeds
- Folder organization
- Document sharing (view/edit permissions + link sharing)
- Google OAuth + email/password
- Auto-save
