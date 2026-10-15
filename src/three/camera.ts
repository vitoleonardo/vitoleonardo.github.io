import { MathUtils, PerspectiveCamera, Vector3 } from 'three'

const FIELD_OF_VIEW_DEG = 15
const DEPTH_RANGE = 4000

let camera: PerspectiveCamera | null = null
let viewportWidth = 1
let viewportHeight = 1

export function createCamera(): PerspectiveCamera {
  camera = new PerspectiveCamera(FIELD_OF_VIEW_DEG, 1, 1, 10)
  return camera
}

export function getCamera(): PerspectiveCamera {
  if (!camera) throw new Error('camera not created')
  return camera
}

export function fitCamera(width: number, height: number): void {
  const active = getCamera()
  viewportWidth = Math.max(1, width)
  viewportHeight = Math.max(1, height)
  const fitDistance = viewportHeight / 2 / Math.tan(MathUtils.degToRad(FIELD_OF_VIEW_DEG / 2))
  active.aspect = viewportWidth / viewportHeight
  active.near = Math.max(1, fitDistance - DEPTH_RANGE)
  active.far = fitDistance + DEPTH_RANGE
  active.updateProjectionMatrix()
  active.position.set(0, 0, fitDistance)
  active.lookAt(new Vector3(0, 0, 0))
  active.updateMatrixWorld()
}

export function getViewport(): { width: number; height: number } {
  return { width: viewportWidth, height: viewportHeight }
}

export function pageToWorld(pageX: number, pageY: number, out: Vector3, depth = 0): Vector3 {
  return out.set(pageX - viewportWidth / 2, viewportHeight / 2 - pageY, depth)
}
