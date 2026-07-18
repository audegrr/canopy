import { describe, expect, it } from 'vitest'
import { isRecord, isUuid, normalizeEmail } from './validation'

describe('request validation', () => {
  it('accepts UUIDs and rejects ambiguous identifiers', () => {
    expect(isUuid('550e8400-e29b-41d4-a716-446655440000')).toBe(true)
    expect(isUuid('../admin')).toBe(false)
    expect(isUuid('550e8400-e29b-41d4-a716')).toBe(false)
  })

  it('normalizes valid email addresses', () => {
    expect(normalizeEmail('  Person@Example.COM ')).toBe('person@example.com')
    expect(normalizeEmail('not-an-email')).toBeNull()
    expect(normalizeEmail(null)).toBeNull()
  })

  it('accepts only plain record-shaped JSON values', () => {
    expect(isRecord({ page_id: 'id' })).toBe(true)
    expect(isRecord([])).toBe(false)
    expect(isRecord(null)).toBe(false)
  })
})
