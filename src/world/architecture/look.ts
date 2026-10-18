export type LookId = 'a' | 'b' | 'c'

export const lookIds: readonly LookId[] = ['a', 'b', 'c']
export const defaultLook: LookId = 'c'
export const lookParameter = 'look'

export const lookNames: Readonly<Record<LookId, string>> = {
  a: 'Brutalist fins',
  b: 'Exoskeleton',
  c: 'Helix terraces',
}

function isLookId(value: string | null): value is LookId {
  return value !== null && (lookIds as readonly string[]).includes(value)
}

export function readLook(search: string): LookId {
  const requested = new URLSearchParams(search).get(lookParameter)
  return isLookId(requested) ? requested : defaultLook
}
