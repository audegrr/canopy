-- Fix (part 2 of the delete-page bug): workspace owners still could not
-- update/delete pages they didn't create, even after 013_pages_write_access.sql
-- added a workspace-owner-aware UPDATE/DELETE policy.
--
-- Root cause: PostgreSQL requires a row to satisfy an applicable SELECT
-- policy IN ADDITION TO the UPDATE/DELETE policy's own USING clause, because
-- UPDATE/DELETE must first be able to "see" the row to identify it. The
-- existing SELECT policies ("Members see workspace pages", "pages select",
-- "pages_select") only check owner_id, page_shares, and link_permission —
-- they never check is_workspace_owner() or is_workspace_member(). Workspace
-- owners only ever saw workspace pages via the /api/workspace-pages route,
-- which uses the service role to bypass RLS entirely — masking the fact
-- that plain RLS SELECT never actually granted them visibility. Without
-- SELECT visibility, the UPDATE policy added in 013 could never take effect
-- for a workspace owner or plain member, despite being logically correct.
--
-- Solution: add a permissive SELECT policy mirroring the UPDATE/DELETE
-- policies from 013.

CREATE POLICY "workspace members and editors can select pages"
ON public.pages
FOR SELECT
USING (
  owner_id = auth.uid()
  OR is_workspace_owner(workspace_id)
  OR is_workspace_member(workspace_id)
  OR is_page_shared_editor(id)
);
