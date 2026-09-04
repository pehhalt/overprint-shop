import { describe, expect, it } from 'vitest'
import { anyone, isLoggedIn } from '@/access'

describe('anyone', () => {
  it('allows an unauthenticated request', () => {
    expect(anyone({} as never)).toBe(true)
  })
})

describe('isLoggedIn', () => {
  it('refuses a request with no user', () => {
    expect(isLoggedIn({ req: { user: null } } as never)).toBe(false)
  })

  it('allows a request with a user', () => {
    expect(isLoggedIn({ req: { user: { id: '1' } } } as never)).toBe(true)
  })
})
