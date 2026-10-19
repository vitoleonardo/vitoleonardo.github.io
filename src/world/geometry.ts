import {
  BoxGeometry,
  BufferGeometry,
  Color,
  CylinderGeometry,
  Euler,
  Float32BufferAttribute,
  InstancedMesh,
  Matrix4,
  Quaternion,
  Vector3,
  type ColorRepresentation,
  type Material,
} from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { Vec3 } from './types'

const upAxis = new Vector3(0, 1, 0)
const unitScale: Vec3 = [1, 1, 1]
const noRotation: Vec3 = [0, 0, 0]

export function createRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let mixed = state
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1)
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61)
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296
  }
}

export function composeMatrix(
  position: Vec3,
  rotation: Vec3 = noRotation,
  scale: Vec3 = unitScale,
): Matrix4 {
  const orientation = new Quaternion().setFromEuler(new Euler(rotation[0], rotation[1], rotation[2]))
  return new Matrix4().compose(new Vector3(...position), orientation, new Vector3(...scale))
}

export function place(
  geometry: BufferGeometry,
  position: Vec3,
  rotation: Vec3 = noRotation,
  scale: Vec3 = unitScale,
): BufferGeometry {
  return geometry.applyMatrix4(composeMatrix(position, rotation, scale))
}

export function block(size: Vec3, center: Vec3, rotation: Vec3 = noRotation): BufferGeometry {
  return place(new BoxGeometry(size[0], size[1], size[2]), center, rotation)
}

export function blockBetween(min: Vec3, max: Vec3): BufferGeometry {
  return block(
    [max[0] - min[0], max[1] - min[1], max[2] - min[2]],
    [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2],
  )
}

export function strut(from: Vec3, to: Vec3, thickness: number): BufferGeometry {
  const start = new Vector3(...from)
  const end = new Vector3(...to)
  const direction = end.clone().sub(start)
  const length = direction.length()
  const orientation = new Quaternion().setFromUnitVectors(upAxis, direction.normalize())
  const midpoint = start.add(end).multiplyScalar(0.5)
  const matrix = new Matrix4().compose(midpoint, orientation, new Vector3(1, 1, 1))
  return new BoxGeometry(thickness, length, thickness).applyMatrix4(matrix)
}

export function cylinderBetween(
  from: Vec3,
  to: Vec3,
  radius: number,
  radialSegments = 12,
  openEnded = false,
): BufferGeometry {
  const start = new Vector3(...from)
  const end = new Vector3(...to)
  const direction = end.clone().sub(start)
  const length = direction.length()
  const orientation = new Quaternion().setFromUnitVectors(upAxis, direction.normalize())
  const matrix = new Matrix4().compose(start.add(end).multiplyScalar(0.5), orientation, new Vector3(1, 1, 1))
  return new CylinderGeometry(radius, radius, length, radialSegments, 1, openEnded).applyMatrix4(matrix)
}

export function merge(geometries: readonly BufferGeometry[]): BufferGeometry {
  const needsFlattening = geometries.some((geometry) => geometry.index === null)
  const prepared = needsFlattening
    ? geometries.map((geometry) => (geometry.index === null ? geometry : geometry.toNonIndexed()))
    : [...geometries]
  const merged = mergeGeometries(prepared)
  for (const geometry of new Set([...geometries, ...prepared])) geometry.dispose()
  if (!merged) throw new Error('Merged geometries must share one attribute layout')
  return merged
}

export function projectWorldUVs(geometry: BufferGeometry, tileSize: number): BufferGeometry {
  const position = geometry.getAttribute('position')
  const normal = geometry.getAttribute('normal')
  const uv = new Float32Array(position.count * 2)
  for (let index = 0; index < position.count; index += 1) {
    const facingX = Math.abs(normal.getX(index))
    const facingY = Math.abs(normal.getY(index))
    const facingZ = Math.abs(normal.getZ(index))
    const x = position.getX(index)
    const y = position.getY(index)
    const z = position.getZ(index)
    const [u, v] = facingY >= facingX && facingY >= facingZ ? [x, z] : facingX >= facingZ ? [z, y] : [x, y]
    uv[index * 2] = u / tileSize
    uv[index * 2 + 1] = v / tileSize
  }
  geometry.setAttribute('uv', new Float32BufferAttribute(uv, 2))
  return geometry
}

export function scaleUVs(geometry: BufferGeometry, scaleU: number, scaleV: number): BufferGeometry {
  const uv = geometry.getAttribute('uv')
  for (let index = 0; index < uv.count; index += 1) {
    uv.setXY(index, uv.getX(index) * scaleU, uv.getY(index) * scaleV)
  }
  uv.needsUpdate = true
  return geometry
}

export function tintVertices(geometry: BufferGeometry, color: ColorRepresentation): BufferGeometry {
  const tint = new Color(color)
  const count = geometry.getAttribute('position').count
  const colors = new Float32Array(count * 3)
  for (let index = 0; index < count; index += 1) {
    colors[index * 3] = tint.r
    colors[index * 3 + 1] = tint.g
    colors[index * 3 + 2] = tint.b
  }
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3))
  return geometry
}

export function instances(
  geometry: BufferGeometry,
  material: Material,
  matrices: readonly Matrix4[],
  colors?: readonly ColorRepresentation[],
): InstancedMesh {
  const mesh = new InstancedMesh(geometry, material, matrices.length)
  matrices.forEach((matrix, index) => mesh.setMatrixAt(index, matrix))
  if (colors) {
    const color = new Color()
    colors.forEach((value, index) => mesh.setColorAt(index, color.set(value)))
  }
  mesh.computeBoundingSphere()
  return mesh
}
