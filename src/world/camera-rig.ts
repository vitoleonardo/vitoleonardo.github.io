import { MathUtils, Matrix4, Object3D, type PerspectiveCamera, Vector3 } from 'three'
import { clamp, damp, lerp, resolvePose, segmentState, smoothstep, tallScreenCorrection } from './interp'
import type { CameraPose, ChapterSpec } from './types'

const TANGENT_REACH = 0.5
const DESKTOP_SHIFT = { x: 0.36, y: 0 } as const
const MOBILE_SHIFT = { x: 0, y: 0.4 } as const
const PARALLAX_YAW_DEGREES = 1.2
const PARALLAX_PITCH_DEGREES = 0.8
const PARALLAX_SLIDE_METRES = 0.12
const PARALLAX_LIFT_METRES = 0.08
const PARALLAX_DAMPING = 3.2
const PARALLAX_SEAM_START = 0.12
const PARALLAX_SEAM_END = 0.34
const FOV_EPSILON = 0.001
const UP = new Vector3(0, 1, 0)

export interface CompositionShift {
  x: number
  y: number
}

export interface CameraPath {
  position(progress: number, out: Vector3): Vector3
  target(progress: number, out: Vector3): Vector3
  fov(progress: number): number
}

export interface Viewport {
  width: number
  height: number
  mobile: boolean
}

export interface RigUpdate {
  progress: number
  dt: number
  parallax: boolean
}

export interface CameraRig {
  readonly root: Object3D
  setViewport(viewport: Viewport): void
  setPointer(x: number, y: number): void
  update(frame: RigUpdate): void
  dispose(): void
}

export function compositionShift(mobile: boolean): CompositionShift {
  return mobile ? MOBILE_SHIFT : DESKTOP_SHIFT
}

export function applyLensShift(camera: PerspectiveCamera, width: number, height: number, shift: CompositionShift): void {
  camera.setViewOffset(width, height, (-shift.x * width) / 2, (shift.y * height) / 2, width, height)
}

type SegmentSpline = (segment: number, t: number, out: Vector3) => Vector3

function chordDirection(from: Vector3, to: Vector3): Vector3 {
  const chord = new Vector3().subVectors(to, from)
  return chord.lengthSq() > 0 ? chord.normalize() : chord
}

function tangentDirections(points: readonly Vector3[]): Vector3[] {
  return points.map((point, index) => {
    const arrival = chordDirection(points[Math.max(0, index - 1)], point)
    const departure = chordDirection(point, points[Math.min(points.length - 1, index + 1)])
    const bisector = arrival.add(departure)
    return bisector.lengthSq() > 0 ? bisector.normalize() : bisector
  })
}

export function createSegmentSpline(points: readonly Vector3[]): SegmentSpline {
  const directions = tangentDirections(points)
  const last = points.length - 1
  return (segment, t, out) => {
    const fromIndex = clamp(segment, 0, last)
    const toIndex = Math.min(fromIndex + 1, last)
    const from = points[fromIndex]
    const to = points[toIndex]
    const reach = from.distanceTo(to) * TANGENT_REACH
    const t2 = t * t
    const t3 = t2 * t
    return out
      .copy(from)
      .multiplyScalar(2 * t3 - 3 * t2 + 1)
      .addScaledVector(directions[fromIndex], (t3 - 2 * t2 + t) * reach)
      .addScaledVector(to, -2 * t3 + 3 * t2)
      .addScaledVector(directions[toIndex], (t3 - t2) * reach)
  }
}

interface RouteLeg {
  firstSegment: number
  approachSplit: number
}

export function createRoute(poses: readonly CameraPose[]): SegmentSpline {
  const points: Vector3[] = []
  const legs: RouteLeg[] = []
  poses.forEach((pose, index) => {
    const arrival = new Vector3(...pose.position)
    if (index > 0) {
      const departure = points[points.length - 1]
      const leg: RouteLeg = { firstSegment: points.length - 1, approachSplit: 1 }
      if (pose.approach) {
        const approach = new Vector3(...pose.approach)
        const inbound = departure.distanceTo(approach)
        leg.approachSplit = inbound / (inbound + approach.distanceTo(arrival))
        points.push(approach)
      }
      legs.push(leg)
    }
    points.push(arrival)
  })
  const spline = createSegmentSpline(points)
  return (segment, t, out) => {
    const leg = legs[segment]
    if (!leg) return out.copy(points[segment === 0 ? 0 : points.length - 1])
    if (t < leg.approachSplit) return spline(leg.firstSegment, t / leg.approachSplit, out)
    if (leg.approachSplit === 1) return spline(leg.firstSegment, t, out)
    return spline(leg.firstSegment + 1, (t - leg.approachSplit) / (1 - leg.approachSplit), out)
  }
}

export function createCameraPath(chapters: readonly ChapterSpec[], mobile: boolean): CameraPath {
  const poses = chapters.map((chapter) => resolvePose(chapter, mobile))
  const positions = createRoute(poses)
  const targets = createSegmentSpline(poses.map((pose) => new Vector3(...pose.target)))

  return {
    position(progress, out) {
      const { index, t } = segmentState(progress, chapters)
      return positions(index, t, out)
    },
    target(progress, out) {
      const { index, t } = segmentState(progress, chapters)
      return targets(index, t, out)
    },
    fov(progress) {
      const { index, t } = segmentState(progress, chapters)
      return lerp(poses[index].fov, poses[Math.min(index + 1, poses.length - 1)].fov, t)
    },
  }
}

export function seamWeight(progress: number): number {
  const distanceFromChapter = Math.abs(progress - Math.round(progress))
  return 1 - smoothstep(PARALLAX_SEAM_START, PARALLAX_SEAM_END, distanceFromChapter)
}

export function createCameraRig(
  camera: PerspectiveCamera,
  chapters: readonly ChapterSpec[],
  viewport: Viewport,
): CameraRig {
  const pathRig = new Object3D()
  pathRig.name = 'camera-path-rig'
  const inputRig = new Object3D()
  inputRig.name = 'camera-input-rig'
  pathRig.add(inputRig)
  inputRig.add(camera)
  camera.position.set(0, 0, 0)
  camera.rotation.set(0, 0, 0)

  const position = new Vector3()
  const target = new Vector3()
  const viewDirection = new Vector3()
  const orientation = new Matrix4()
  const pointerTarget = { x: 0, y: 0 }
  const pointer = { x: 0, y: 0 }
  let current: Viewport = { ...viewport }
  let path = createCameraPath(chapters, current.mobile)
  let correction = tallScreenCorrection(current.width, current.height, current.mobile)

  function setViewport(next: Viewport): void {
    if (next.mobile !== current.mobile) path = createCameraPath(chapters, next.mobile)
    current = { ...next }
    correction = tallScreenCorrection(current.width, current.height, current.mobile)
    applyLensShift(camera, current.width, current.height, compositionShift(current.mobile))
  }

  function setPointer(x: number, y: number): void {
    pointerTarget.x = clamp(x, -1, 1)
    pointerTarget.y = clamp(y, -1, 1)
  }

  function update({ progress, dt, parallax }: RigUpdate): void {
    path.position(progress, position)
    path.target(progress, target)
    viewDirection.subVectors(target, position).normalize()
    position.addScaledVector(viewDirection, -correction.pullback)
    pathRig.position.copy(position)
    orientation.lookAt(position, target, UP)
    pathRig.quaternion.setFromRotationMatrix(orientation)

    const weight = parallax ? seamWeight(progress) : 0
    pointer.x = damp(pointer.x, pointerTarget.x * weight, PARALLAX_DAMPING, dt)
    pointer.y = damp(pointer.y, pointerTarget.y * weight, PARALLAX_DAMPING, dt)
    inputRig.position.set(pointer.x * PARALLAX_SLIDE_METRES, -pointer.y * PARALLAX_LIFT_METRES, 0)
    inputRig.rotation.set(
      MathUtils.degToRad(-pointer.y * PARALLAX_PITCH_DEGREES),
      MathUtils.degToRad(-pointer.x * PARALLAX_YAW_DEGREES),
      0,
    )

    const fov = path.fov(progress) + correction.fovOpen
    if (Math.abs(camera.fov - fov) > FOV_EPSILON) {
      camera.fov = fov
      camera.updateProjectionMatrix()
    }
  }

  function dispose(): void {
    inputRig.remove(camera)
    pathRig.removeFromParent()
  }

  setViewport(current)

  return { root: pathRig, setViewport, setPointer, update, dispose }
}
