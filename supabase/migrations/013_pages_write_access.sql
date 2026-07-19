-- Fix: workspace owners/members (and users with an "edit" share) cannot
-- update or delete pages they didn't personally create.
--
-- Root cause: the RLS SELECT policy on `pages` already grants read access
-- via owner_id OR page_shares OR is_workspace_member()/is_workspace_owner()
-- (see 010_workspace_pages_access.sql), but the UPDATE/DELETE policies were
-- never widened to match — they only allow owner_id = auth.uid(). This makes
-- writes (including soft-deletes, i.e. moving a page to Trash) silently
-- match zero rows for any page a collaborator didn't create themselves:
-- Postgres RLS filters the row out instead of raising an error, so the
-- client sees success ("Page moved to trash") even though nothing changed
-- in the database and the page never appears in Trash.
--
-- Solution: add permissive UPDATE/DELETE policies mirroring the SELECT
-- policy's access model. A new SECURITY DEFINER function is added for the
-- "shared with edit permission" case, per the existing rule in this project
-- that any RLS policy cross-referencing another RLS-protected table must go
-- through a SECURITY DEFINER function rather than a direct subquery (see
-- is_workspace_member / is_workspace_owner / is_page_owner).

CREATE OR REPLACE FUNCTION public.is_page_shared_editor(p_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.page_shares ps
    WHERE ps.page_id = p_id
      AND ps.user_id = auth.uid()
      AND ps.permission = 'edit'
  );
$$;

CREATE POLICY "workspace members and editors can update pages"
ON public.pages
FOR UPDATE
USING (
  owner_id = auth.uid()
  OR is_workspace_owner(workspace_id)
  OR is_workspace_member(workspace_id)
  OR is_page_shared_editor(id)
)
WITH CHECK (
  owner_id = auth.uid()
  OR is_workspace_owner(workspace_id)
  OR is_workspace_member(workspace_id)
  OR is_page_shared_editor(id)
);

CREATE POLICY "workspace members and editors can delete pages"
ON public.pages
FOR DELETE
USING (
  owner_id = auth.uid()
  OR is_workspace_owner(workspace_id)
  OR is_workspace_member(workspace_id)
  OR is_page_shared_editor(id)
);
