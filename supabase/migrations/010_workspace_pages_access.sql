-- Fix: workspace owners and members can see all pages in their workspace,
-- regardless of who created each page.
--
-- Root cause: the RLS SELECT policy on `pages` was only granting access via
-- owner_id OR page_shares OR is_workspace_member(). But workspace OWNERS are
-- NOT in workspace_members, so they could not read pages created by members.
--
-- Solution: add a SECURITY DEFINER function that explicitly checks both
-- workspace ownership and membership, bypassing any RLS circular dependency.
-- This function is used in switchWorkspace and the initial page load.

CREATE OR REPLACE FUNCTION public.get_workspace_pages(ws_id uuid)
RETURNS TABLE (
  id uuid,
  workspace_id uuid,
  parent_id uuid,
  title text,
  icon text,
  cover_url text,
  content jsonb,
  position integer,
  is_database boolean,
  owner_id uuid,
  link_permission text,
  created_at timestamptz,
  updated_at timestamptz,
  deleted_at timestamptz,
  is_locked boolean,
  view_count integer,
  cover_position text
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    p.id, p.workspace_id, p.parent_id, p.title, p.icon, p.cover_url,
    p.content, p.position, p.is_database, p.owner_id, p.link_permission,
    p.created_at, p.updated_at, p.deleted_at, p.is_locked, p.view_count,
    p.cover_position
  FROM public.pages p
  WHERE p.workspace_id = ws_id
    AND p.deleted_at IS NULL
    AND (
      -- Workspace owner
      EXISTS (
        SELECT 1 FROM public.workspaces w
        WHERE w.id = ws_id AND w.owner_id = auth.uid()
      )
      -- Workspace member
      OR EXISTS (
        SELECT 1 FROM public.workspace_members m
        WHERE m.workspace_id = ws_id AND m.user_id = auth.uid()
      )
    );
$$;
