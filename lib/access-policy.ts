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
  const sharedCanEdit = rows.sharePermission === 'edit'
  const canEdit = ownsPage || ownsWorkspace || memberCanEdit || sharedCanEdit || rows.linkPermission === 'edit'

  return {
    canView: canEdit || !!rows.membershipRole || !!rows.sharePermission || rows.linkPermission === 'view',
    canEdit,
    canManage: ownsPage || ownsWorkspace || memberCanEdit || sharedCanEdit,
    isWorkspaceMember: ownsWorkspace || !!rows.membershipRole,
  }
}
