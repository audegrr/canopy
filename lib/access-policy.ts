export type PageAccess = {
  canView: boolean
  canEdit: boolean
  canManage: boolean
  isWorkspaceMember: boolean
}

type AccessRows = {
  userId: string
  pageOwnerId: string
  linkPermission?: string | null
  workspaceOwnerId?: string | null
  membershipRole?: string | null
  sharePermission?: string | null
}

export function derivePageAccess(rows: AccessRows): PageAccess {
  const ownsPage = rows.pageOwnerId === rows.userId
  const ownsWorkspace = rows.workspaceOwnerId === rows.userId
  const memberCanEdit = rows.membershipRole === 'owner' || rows.membershipRole === 'member'
  const sharedIsOwnerTier = rows.sharePermission === 'owner'
  const sharedCanEdit = rows.sharePermission === 'edit' || sharedIsOwnerTier
  // Manage rights (sharing/link permission, moving/reorganizing) are reserved for
  // page/workspace ownership or an explicit 'owner'-tier share — plain workspace
  // membership and 'edit' shares grant content edit but not management.
  const canManage = ownsPage || ownsWorkspace || rows.membershipRole === 'owner' || sharedIsOwnerTier
  const canEdit = canManage || memberCanEdit || sharedCanEdit || rows.linkPermission === 'edit'

  return {
    canView: canEdit || !!rows.membershipRole || !!rows.sharePermission || rows.linkPermission === 'view',
    canEdit,
    canManage,
    isWorkspaceMember: ownsWorkspace || !!rows.membershipRole,
  }
}
