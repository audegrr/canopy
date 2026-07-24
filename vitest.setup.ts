import { vi } from 'vitest'

// 'server-only' throws unconditionally unless Next.js's webpack build aliases
// it away; outside that build (i.e. under vitest) it needs a no-op stand-in
// so server-side modules that import it can be loaded in tests.
vi.mock('server-only', () => ({}))
