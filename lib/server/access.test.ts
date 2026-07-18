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

  it.each(['owner', 'member'])('allows workspace role %s to edit and reorganize', membershipRole => {
    const access = derivePageAccess({ ...base, membershipRole })
    expect(access.canEdit).toBe(true)
    expect(access.canManage).toBe(true)
  })

  it('keeps workspace viewers read-only', () => {
    expect(derivePageAccess({ ...base, membershipRole: 'viewer' })).toMatchObject({ canView: true, canEdit: false, canManage: false })
  })

  it('allows a direct editor to manage the shared page', () => {
    expect(derivePageAccess({ ...base, sharePermission: 'edit' })).toMatchObject({ canEdit: true, canManage: true })
  })
})
