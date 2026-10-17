const finePointerQuery = window.matchMedia('(hover: hover) and (pointer: fine)')

export function hasFinePointer(): boolean {
  return finePointerQuery.matches
}
