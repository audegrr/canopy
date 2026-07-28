# Canopy operations guide

Canopy is a small, private application intended for a trusted group of roughly
20 people. Operational priorities are data recovery, predictable deployments
and keeping the English interface understandable.

## Routine schedule

| Frequency | Action |
| --- | --- |
| Weekly | Export each active workspace from **Settings → Workspace → Portable backup** and store the JSON outside Canopy. |
| Monthly | Export and commit the remote Supabase schema with `npm run backup:schema`. |
| Monthly | Run `npm audit --omit=dev`, `npm test`, `npm run lint`, `npm run check:english`, and `npm run build`. |
| Quarterly | Restore a workspace backup into a temporary workspace and complete the recovery checklist below. |
| When membership changes | Review workspace members, pending invitations, page links and Vercel/Supabase access. |

Keep at least three generations of workspace exports in storage that is
independent of Supabase and Vercel. The JSON contains private workspace content;
encrypt it at rest and restrict access to the same people who may access Canopy.

## Workspace backup and restore

Workspace owners can export pages, databases, comments, version history and
attachment URLs from the workspace settings. The export does not copy attachment
binary data, so Supabase Storage must also be covered by the project's platform
backup or a separate storage export.

To test recovery:

1. Create a temporary empty workspace.
2. Import the latest workspace JSON into it.
3. Compare the page count and hierarchy with the source workspace.
4. Open at least one rich-text page and one database.
5. Check comments and version history.
6. Open representative image and file attachments.
7. Export the restored workspace again.
8. Delete the temporary workspace only after the checks pass.

Imports only add content and never replace existing content. If an import fails,
Canopy attempts to remove everything created by that attempt and reports whether
manual cleanup is needed.

## Database schema recovery

The incremental files in `supabase/migrations/` describe changes made after the
original database was created. Capture the complete current public schema:

```bash
supabase login
supabase link --project-ref <project-ref>
npm run backup:schema
git add supabase/schema.sql
git commit -m "chore: refresh Supabase schema snapshot"
```

`supabase/schema.sql` is a recovery snapshot, while `supabase/migrations/` remains
the change history. The schema dump contains no application rows, but it can
reveal database structure and should remain in the private repository.

For a full disaster recovery test, create a separate Supabase project, apply the
schema snapshot, configure the required Storage buckets (`images`) and Auth
providers, then restore workspace JSON. Never test restoration against production.

## Deployment

Before deploying:

```bash
npm ci
npm run lint
npm run check:english
npm test
npm run build
npm run check:bundle
```

Apply pending Supabase migrations before deploying code that depends on them.
After deployment, sign in and verify page loading, editing, invitations, search
and one export.

## Secrets and access

- Keep `SUPABASE_SERVICE_ROLE_KEY`, `GROQ_API_KEY`, `RESEND_API_KEY` and
  `VAPID_PRIVATE_KEY` server-only.
- Remove former maintainers from GitHub, Vercel and Supabase.
- Rotate secrets immediately after suspected exposure and periodically according
  to the organization's policy.
- Review public page links after users leave.
- Do not put production secrets or workspace exports in Git.

## Incident checklist

For failed saves, imports, invitations or notifications:

1. Preserve the user's current tab and copy unsaved text if possible.
2. Record the time, user, workspace, page and visible error message.
3. Check Vercel function logs for the structured `client_error` event.
4. Check Supabase health, database logs and Storage availability.
5. Avoid repeated imports until the first attempt's cleanup status is known.
6. Restore into a temporary workspace first if data recovery is required.

The client telemetry endpoint intentionally records only a bounded error message,
operation name and path. It must never receive document content, credentials or
personal form values.
