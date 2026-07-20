import { describe, expect, it } from 'vitest'
import { derivePageAccess } from '../access-policy'

const base = { userId: 'viewer', pageOwnerId: 'owner', linkPermission: 'none' }

describe('page access policy', () => {
  it('keeps an anonymous public-read link view-only', () => {
    expect(derivePageAccess({ ...base, linkPermission: 'view' })).toEqual({
      canView: true, canEdit: false, canManage: false, isWorkspaceMember: false,
    })
  })

  it('allows editing through an edit link without allowing share management', () => {
    const access = derivePageAccess({ ...base, linkPermission: 'edit' })
    expect(access.canEdit).toBe(true)
    expect(access.canManage).toBe(false)
  })

  it('lets a workspace owner-role member edit and reorganize', () => {
    const access = derivePageAccess({ ...base, membershipRole: 'owner' })
    expect(access.canEdit).toBe(true)
    expect(access.canManage).toBe(true)
  })

  it('lets a regular workspace member edit but not manage', () => {
    const access = derivePageAccess({ ...base, membershipRole: 'member' })
    expect(access.canEdit).toBe(true)
    expect(access.canManage).toBe(false)
  })

  it('keeps workspace viewers read-only', () => {
    expect(derivePageAccess({ ...base, membershipRole: 'viewer' })).toMatchObject({ canView: true, canEdit: false, canManage: false })
  })

  it('allows a direct editor to edit but not manage the shared page', () => {
    expect(derivePageAccess({ ...base, sharePermission: 'edit' })).toMatchObject({ canEdit: true, canManage: false })
  })

  it('allows an owner-tier share to edit and manage the shared page', () => {
    expect(derivePageAccess({ ...base, sharePermission: 'owner' })).toMatchObject({ canEdit: true, canManage: true })
  })
})
