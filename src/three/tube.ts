import { BufferAttribute, BufferGeometry, DynamicDrawUsage, Vector3 } from 'three'

const tangentScratch = new Vector3()
const normalScratch = new Vector3()
const binormalScratch = new Vector3()
const previousNormal = new Vector3()
const fallbackAxis = new Vector3(0, 0, 1)
const secondaryAxis = new Vector3(0, 1, 0)

function dynamicAttribute(array: Float32Array, itemSize: number): BufferAttribute {
  return new BufferAttribute(array, itemSize).setUsage(DynamicDrawUsage)
}

export class PathTube {
  readonly geometry = new BufferGeometry()
  readonly capsGeometry = new BufferGeometry()
  readonly ringCenters: Float32Array
  readonly ringTangents: Float32Array
  readonly ringSides: Float32Array
  readonly ringArcs: Float32Array
  private readonly ringNormals: Float32Array
  private readonly ringBinormals: Float32Array
  private readonly positions: Float32Array
  private readonly normals: Float32Array
  private readonly arcs: Float32Array
  private readonly sides: Float32Array
  private readonly capPositions: Float32Array
  private readonly capNormals: Float32Array
  private readonly capArcs: Float32Array
  private readonly capSides: Float32Array
  private readonly cosines: Float32Array
  private readonly sines: Float32Array
  private readonly capVertexCount: number
  private readonly segmentIndexCount: number
  private readonly capLatitudes: number[]
  length = 0

  constructor(
    readonly ringCount: number,
    readonly radialSegments: number,
    readonly capRings = 6,
  ) {
    this.ringCenters = new Float32Array(ringCount * 3)
    this.ringTangents = new Float32Array(ringCount * 3)
    this.ringNormals = new Float32Array(ringCount * 3)
    this.ringBinormals = new Float32Array(ringCount * 3)
    this.ringSides = new Float32Array(ringCount * 2)
    this.ringArcs = new Float32Array(ringCount)
    const bodyVertexCount = ringCount * radialSegments
    this.positions = new Float32Array(bodyVertexCount * 3)
    this.normals = new Float32Array(bodyVertexCount * 3)
    this.arcs = new Float32Array(bodyVertexCount * 2)
    this.sides = new Float32Array(bodyVertexCount * 2)
    this.capVertexCount = capRings * radialSegments + 1
    this.capPositions = new Float32Array(this.capVertexCount * 2 * 3)
    this.capNormals = new Float32Array(this.capVertexCount * 2 * 3)
    this.capArcs = new Float32Array(this.capVertexCount * 2 * 2)
    this.capSides = new Float32Array(this.capVertexCount * 2 * 2)
    this.cosines = new Float32Array(radialSegments)
    this.sines = new Float32Array(radialSegments)
    for (let k = 0; k < radialSegments; k++) {
      const angle = (k / radialSegments) * Math.PI * 2
      this.cosines[k] = Math.cos(angle)
      this.sines[k] = Math.sin(angle)
    }
    this.capLatitudes = Array.from({ length: capRings }, (_, j) => (j / capRings) * (Math.PI / 2))

    const bodyIndices: number[] = []
    for (let i = 0; i < ringCount - 1; i++) {
      for (let k = 0; k < radialSegments; k++) {
        const next = (k + 1) % radialSegments
        const a = i * radialSegments + k
        const b = i * radialSegments + next
        const c = (i + 1) * radialSegments + k
        const d = (i + 1) * radialSegments + next
        bodyIndices.push(a, b, c, b, d, c)
      }
    }
    this.segmentIndexCount = radialSegments * 6
    this.geometry.setAttribute('position', dynamicAttribute(this.positions, 3))
    this.geometry.setAttribute('normal', dynamicAttribute(this.normals, 3))
    this.geometry.setAttribute('aArc', dynamicAttribute(this.arcs, 2))
    this.geometry.setAttribute('aSide', dynamicAttribute(this.sides, 2))
    this.geometry.setIndex(bodyIndices)
    this.geometry.setDrawRange(0, 0)

    const capIndices: number[] = []
    this.pushCapIndices(capIndices, 0, true)
    this.pushCapIndices(capIndices, this.capVertexCount, false)
    this.capsGeometry.setAttribute('position', dynamicAttribute(this.capPositions, 3))
    this.capsGeometry.setAttribute('normal', dynamicAttribute(this.capNormals, 3))
    this.capsGeometry.setAttribute('aArc', dynamicAttribute(this.capArcs, 2))
    this.capsGeometry.setAttribute('aSide', dynamicAttribute(this.capSides, 2))
    this.capsGeometry.setIndex(capIndices)
  }

  private pushCapIndices(indices: number[], base: number, facesBackward: boolean): void {
    const segments = this.radialSegments
    for (let j = 0; j < this.capRings - 1; j++) {
      for (let k = 0; k < segments; k++) {
        const next = (k + 1) % segments
        const a = base + j * segments + k
        const b = base + j * segments + next
        const c = base + (j + 1) * segments + k
        const d = base + (j + 1) * segments + next
        if (facesBackward) indices.push(a, c, b, b, c, d)
        else indices.push(a, b, c, b, d, c)
      }
    }
    const pole = base + this.capRings * segments
    const lastRing = base + (this.capRings - 1) * segments
    for (let k = 0; k < segments; k++) {
      const next = (k + 1) % segments
      if (facesBackward) indices.push(lastRing + k, pole, lastRing + next)
      else indices.push(lastRing + k, lastRing + next, pole)
    }
  }

  update(points: Float32Array, radius: number, ringRadiusScale: Float32Array | null = null): boolean {
    const count = this.ringCount
    this.copyCentersAndTangents(points)
    if (this.length < 1e-3) {
      this.geometry.setDrawRange(0, 0)
      return false
    }
    this.computeFrames()

    const radiusAt = (ring: number): number => radius * (ringRadiusScale ? ringRadiusScale[ring] : 1)
    const segments = this.radialSegments
    const total = Math.max(1e-6, this.length)
    for (let i = 0; i < count; i++) {
      this.writeRing(this.positions, this.normals, i * segments, i, radiusAt(i), 0, 1, 0)
      const arc = this.ringArcs[i]
      const sideX = this.ringSides[i * 2]
      const sideY = this.ringSides[i * 2 + 1]
      for (let k = 0; k < segments; k++) {
        const vertex = (i * segments + k) * 2
        this.arcs[vertex] = arc
        this.arcs[vertex + 1] = arc / total
        this.sides[vertex] = sideX
        this.sides[vertex + 1] = sideY
      }
    }
    this.writeCap(0, 0, radiusAt(0), -1)
    this.writeCap(this.capVertexCount, count - 1, radiusAt(count - 1), 1)

    this.geometry.getAttribute('position').needsUpdate = true
    this.geometry.getAttribute('normal').needsUpdate = true
    this.geometry.getAttribute('aArc').needsUpdate = true
    this.geometry.getAttribute('aSide').needsUpdate = true
    this.capsGeometry.getAttribute('position').needsUpdate = true
    this.capsGeometry.getAttribute('normal').needsUpdate = true
    this.capsGeometry.getAttribute('aArc').needsUpdate = true
    this.capsGeometry.getAttribute('aSide').needsUpdate = true
    this.geometry.setDrawRange(0, (count - 1) * this.segmentIndexCount)
    return true
  }

  private tangentAt(points: Float32Array, index: number, out: Vector3): Vector3 {
    const count = this.ringCount
    const before = Math.max(0, index - 1)
    const after = Math.min(count - 1, index + 1)
    out.set(
      points[after * 3] - points[before * 3],
      points[after * 3 + 1] - points[before * 3 + 1],
      points[after * 3 + 2] - points[before * 3 + 2],
    )
    return out
  }

  private copyCentersAndTangents(points: Float32Array): void {
    const count = this.ringCount
    const centers = this.ringCenters
    const tangents = this.ringTangents
    let previousX = 1
    let previousY = 0
    let previousZ = 0
    let arc = 0
    for (let i = 0; i < count; i++) {
      centers[i * 3] = points[i * 3]
      centers[i * 3 + 1] = points[i * 3 + 1]
      centers[i * 3 + 2] = points[i * 3 + 2]
      if (i > 0) {
        arc += Math.hypot(
          points[i * 3] - points[(i - 1) * 3],
          points[i * 3 + 1] - points[(i - 1) * 3 + 1],
          points[i * 3 + 2] - points[(i - 1) * 3 + 2],
        )
      }
      this.ringArcs[i] = arc
      this.tangentAt(points, i, tangentScratch)
      const length = tangentScratch.length()
      if (length > 1e-9) tangentScratch.divideScalar(length)
      else tangentScratch.set(previousX, previousY, previousZ)
      tangents[i * 3] = tangentScratch.x
      tangents[i * 3 + 1] = tangentScratch.y
      tangents[i * 3 + 2] = tangentScratch.z
      const planar = Math.hypot(tangentScratch.x, tangentScratch.y)
      this.ringSides[i * 2] = planar > 1e-6 ? -tangentScratch.y / planar : 0
      this.ringSides[i * 2 + 1] = planar > 1e-6 ? tangentScratch.x / planar : 1
      previousX = tangentScratch.x
      previousY = tangentScratch.y
      previousZ = tangentScratch.z
    }
    this.length = arc
  }

  private computeFrames(): void {
    const tangents = this.ringTangents
    const normals = this.ringNormals
    const binormals = this.ringBinormals
    previousNormal.copy(fallbackAxis)
    for (let i = 0; i < this.ringCount; i++) {
      tangentScratch.set(tangents[i * 3], tangents[i * 3 + 1], tangents[i * 3 + 2])
      normalScratch.copy(previousNormal).addScaledVector(tangentScratch, -tangentScratch.dot(previousNormal))
      if (normalScratch.lengthSq() < 1e-8) {
        normalScratch.copy(secondaryAxis).addScaledVector(tangentScratch, -tangentScratch.dot(secondaryAxis))
      }
      normalScratch.normalize()
      binormalScratch.crossVectors(tangentScratch, normalScratch)
      normals[i * 3] = normalScratch.x
      normals[i * 3 + 1] = normalScratch.y
      normals[i * 3 + 2] = normalScratch.z
      binormals[i * 3] = binormalScratch.x
      binormals[i * 3 + 1] = binormalScratch.y
      binormals[i * 3 + 2] = binormalScratch.z
      previousNormal.copy(normalScratch)
    }
  }

  private writeRing(
    positions: Float32Array,
    normalsOut: Float32Array,
    vertexBase: number,
    ring: number,
    radius: number,
    axialOffset: number,
    radialScale: number,
    normalAxial: number,
  ): void {
    const centers = this.ringCenters
    const tangents = this.ringTangents
    const normals = this.ringNormals
    const binormals = this.ringBinormals
    const tx = tangents[ring * 3]
    const ty = tangents[ring * 3 + 1]
    const tz = tangents[ring * 3 + 2]
    const cx = centers[ring * 3] + tx * axialOffset
    const cy = centers[ring * 3 + 1] + ty * axialOffset
    const cz = centers[ring * 3 + 2] + tz * axialOffset
    for (let k = 0; k < this.radialSegments; k++) {
      const cos = this.cosines[k]
      const sin = this.sines[k]
      const nx = cos * normals[ring * 3] + sin * binormals[ring * 3]
      const ny = cos * normals[ring * 3 + 1] + sin * binormals[ring * 3 + 1]
      const nz = cos * normals[ring * 3 + 2] + sin * binormals[ring * 3 + 2]
      const offset = (vertexBase + k) * 3
      positions[offset] = cx + nx * radius * radialScale
      positions[offset + 1] = cy + ny * radius * radialScale
      positions[offset + 2] = cz + nz * radius * radialScale
      normalsOut[offset] = nx * radialScale + tx * normalAxial
      normalsOut[offset + 1] = ny * radialScale + ty * normalAxial
      normalsOut[offset + 2] = nz * radialScale + tz * normalAxial
    }
  }

  private writeCap(vertexBase: number, ring: number, radius: number, direction: 1 | -1): void {
    const segments = this.radialSegments
    for (let j = 0; j < this.capRings; j++) {
      const latitude = this.capLatitudes[j]
      const axial = Math.sin(latitude)
      const radial = Math.cos(latitude)
      this.writeRing(this.capPositions, this.capNormals, vertexBase + j * segments, ring, radius, direction * axial * radius, radial, direction * axial)
    }
    const pole = (vertexBase + this.capRings * segments) * 3
    const tangents = this.ringTangents
    const centers = this.ringCenters
    for (let axis = 0; axis < 3; axis++) {
      this.capPositions[pole + axis] = centers[ring * 3 + axis] + tangents[ring * 3 + axis] * radius * direction
      this.capNormals[pole + axis] = tangents[ring * 3 + axis] * direction
    }
    const total = Math.max(1e-6, this.length)
    const arc = this.ringArcs[ring]
    for (let v = vertexBase; v < vertexBase + this.capVertexCount; v++) {
      this.capArcs[v * 2] = arc
      this.capArcs[v * 2 + 1] = arc / total
      this.capSides[v * 2] = this.ringSides[ring * 2]
      this.capSides[v * 2 + 1] = this.ringSides[ring * 2 + 1]
    }
  }

  dispose(): void {
    this.geometry.dispose()
    this.capsGeometry.dispose()
  }
}
