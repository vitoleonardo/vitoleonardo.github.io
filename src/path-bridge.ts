import type { PathApi } from './types'

let settle: (api: PathApi | null) => void = () => {}

export const pathReady: Promise<PathApi | null> = new Promise((resolve) => {
  settle = resolve
})

export function resolvePath(api: PathApi | null): void {
  settle(api)
}
