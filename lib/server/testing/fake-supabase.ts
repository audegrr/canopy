import { vi } from 'vitest'

// Minimal fake Supabase client for route-handler unit tests. Not a generic
// query-builder emulation — each `.from(table)` call pops the next queued
// { data, error } for that table (FIFO, matching the call order the route
// under test makes), and every chain method is a no-op that returns the same
// thenable builder. `.rpc(name)` works the same way, keyed by RPC name.
export type FakeResult<T = unknown> = { data: T; error: { message: string; code?: string } | null }

type FakeClientConfig = {
  user?: { id: string } | null
  tables?: Record<string, FakeResult[]>
  rpc?: Record<string, FakeResult[]>
}

function makeBuilder(result: FakeResult): any {
  const builder: any = {}
  for (const method of ['select', 'eq', 'is', 'in', 'gt', 'lt', 'gte', 'lte', 'like', 'ilike', 'order', 'limit', 'update', 'insert', 'upsert', 'delete', 'single', 'maybeSingle']) {
    builder[method] = () => builder
  }
  builder.then = (resolve: (r: FakeResult) => void, reject?: (e: unknown) => void) => Promise.resolve(result).then(resolve, reject)
  return builder
}

export function createFakeClient(config: FakeClientConfig) {
  const tableQueues = new Map(Object.entries(config.tables ?? {}).map(([k, v]) => [k, [...v]]))
  const rpcQueues = new Map(Object.entries(config.rpc ?? {}).map(([k, v]) => [k, [...v]]))
  const defaultResult: FakeResult = { data: null, error: null }

  return {
    from(table: string) {
      const queue = tableQueues.get(table)
      const result = queue?.length ? queue.shift()! : defaultResult
      return makeBuilder(result)
    },
    rpc: vi.fn((name: string) => {
      const queue = rpcQueues.get(name)
      const result = queue?.length ? queue.shift()! : defaultResult
      return Promise.resolve(result)
    }),
    auth: {
      getUser: async () => ({ data: { user: config.user ?? null } }),
    },
  }
}
