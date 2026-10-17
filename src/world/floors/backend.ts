import { BoxGeometry, Color, Group, Matrix4, Mesh, MeshBasicMaterial, type BufferGeometry } from 'three'
import { block, composeMatrix, createRandom, cylinderBetween, instances, merge, place, strut, tintVertices } from '../geometry'
import type { FloorFactory, FrameState } from '../types'
import { createEmitter, disposeTree, floorBase, glassMaterial, palette, steelMaterial, towerSpec } from './kit'

interface RackRow {
  label: 'API' | 'Services' | 'Events' | 'Data'
  x: number
  color: string
}

const rows: readonly RackRow[] = [
  { label: 'API', x: -2.8, color: palette.signal },
  { label: 'Services', x: 0.2, color: palette.readable },
  { label: 'Events', x: 3.2, color: palette.warm },
  { label: 'Data', x: 6, color: palette.signal },
]
const racksPerRow = 16
const rackPitch = 0.65
const rackDepth = 1
const rackHeight = 2.2
const rowStartZ = -6.2
const rowEndZ = rowStartZ + racksPerRow * rackPitch
const ledsPerFace = 4
const pipeY = 3.15
const pipeStartZ = -6.9
const pipeEndZ = 6.4
const pipeRadius = 0.13
const packetsPerPipe = 8
const ceiling = towerSpec.floorHeight - towerSpec.slabThickness

interface Led {
  row: number
  frequency: number
  phase: number
  duty: number
}

interface Packet {
  row: number
  offset: number
  speed: number
}

function rackMatrices(): Matrix4[] {
  const matrices: Matrix4[] = []
  for (const row of rows) {
    for (let rack = 0; rack < racksPerRow; rack += 1) {
      matrices.push(composeMatrix([row.x, 0, rowStartZ + rackPitch * (rack + 0.5)]))
    }
  }
  return matrices
}

function rackGeometry(): BufferGeometry {
  return merge([
    block([rackDepth, rackHeight, rackPitch - 0.04], [0, rackHeight / 2 + 0.04, 0]),
    block([rackDepth - 0.06, 0.04, rackPitch - 0.1], [0, 0.02, 0]),
  ])
}

function ledLayout(): { matrices: Matrix4[]; leds: Led[] } {
  const random = createRandom(404)
  const matrices: Matrix4[] = []
  const leds: Led[] = []
  rows.forEach((row, rowIndex) => {
    for (let rack = 0; rack < racksPerRow; rack += 1) {
      const z = rowStartZ + rackPitch * (rack + 0.5)
      for (const face of [-1, 1]) {
        for (let led = 0; led < ledsPerFace; led += 1) {
          const y = 0.45 + led * 0.42 + random() * 0.12
          matrices.push(composeMatrix([row.x + face * (rackDepth / 2 + 0.006), y, z - 0.2 + random() * 0.4]))
          leds.push({ row: rowIndex, frequency: 0.3 + random() * 2.2, phase: random(), duty: 0.15 + random() * 0.7 })
        }
      }
    }
  })
  return { matrices, leds }
}

function infrastructureGeometry(): BufferGeometry {
  const pieces: BufferGeometry[] = []
  for (const row of rows) {
    for (const z of [rowStartZ - 0.03, rowEndZ + 0.03]) {
      pieces.push(block([rackDepth + 0.04, rackHeight + 0.12, 0.05], [row.x, (rackHeight + 0.12) / 2, z]))
    }
    for (let z = pipeStartZ + 0.6; z < pipeEndZ; z += 1.6) {
      pieces.push(place(cylinderBetween([0, 0, -0.03], [0, 0, 0.03], pipeRadius + 0.03, 16), [row.x, pipeY, z]))
      pieces.push(strut([row.x, pipeY + pipeRadius, z], [row.x, ceiling, z], 0.03))
    }
  }
  pieces.push(cylinderBetween([rows[0].x, pipeY + 0.3, pipeEndZ], [rows[rows.length - 1].x, pipeY + 0.3, pipeEndZ], 0.09, 12))
  return merge(pieces)
}

function endBarGeometry(): BufferGeometry {
  const bars: BufferGeometry[] = []
  for (const row of rows) {
    bars.push(tintVertices(block([rackDepth * 0.8, 0.05, 0.02], [row.x, rackHeight - 0.05, rowEndZ + 0.065]), row.color))
  }
  return merge(bars)
}

function pipeGeometry(): BufferGeometry {
  return merge(rows.map((row) => cylinderBetween([row.x, pipeY, pipeStartZ], [row.x, pipeY, pipeEndZ], pipeRadius, 16, true)))
}

export const createBackendFloor: FloorFactory = () => {
  const root = new Group()
  root.name = 'backend'
  root.position.y = floorBase.backend

  const racks = instances(rackGeometry(), steelMaterial({ color: '#2A2E35', roughness: 0.55, metalness: 0.35 }), rackMatrices())
  racks.castShadow = true
  racks.receiveShadow = true

  const ledPlan = ledLayout()
  const rowColors = rows.map((row) => new Color(row.color))
  const leds = instances(
    new BoxGeometry(0.012, 0.025, 0.07),
    new MeshBasicMaterial(),
    ledPlan.matrices,
    ledPlan.leds.map((led) => rowColors[led.row]),
  )

  const infrastructure = new Mesh(infrastructureGeometry(), steelMaterial())
  const endBarEmitter = createEmitter('#ffffff', 1.8, { vertexColors: true })
  const endBars = new Mesh(endBarGeometry(), endBarEmitter.material)
  const pipes = new Mesh(pipeGeometry(), glassMaterial(0.22))

  const random = createRandom(808)
  const packetPlan: Packet[] = []
  rows.forEach((_, row) => {
    const speed = 0.08 + random() * 0.06
    for (let packet = 0; packet < packetsPerPipe; packet += 1) {
      packetPlan.push({ row, offset: packet / packetsPerPipe + random() * 0.05, speed })
    }
  })
  const packetEmitter = createEmitter(palette.signal, 2.6)
  const packets = instances(
    new BoxGeometry(0.09, 0.09, 0.32),
    packetEmitter.material,
    packetPlan.map(() => composeMatrix([0, pipeY, 0])),
  )
  packets.frustumCulled = false

  root.add(racks, leds, infrastructure, endBars, pipes, packets)

  const ledColor = new Color()
  const packetMatrix = new Matrix4()
  const pipeLength = pipeEndZ - pipeStartZ
  let frozenTime = 0

  function update(frame: FrameState): void {
    const time = frame.reducedMotion ? frozenTime : frame.time
    frozenTime = time
    const glow = 0.6 + frame.world.practicals * 0.4
    ledPlan.leds.forEach((led, index) => {
      const on = (time * led.frequency + led.phase) % 1 < led.duty
      leds.setColorAt(index, ledColor.copy(rowColors[led.row]).multiplyScalar((on ? 2.4 : 0.2) * glow))
    })
    if (leds.instanceColor) leds.instanceColor.needsUpdate = true

    packetPlan.forEach((packet, index) => {
      const progress = (packet.offset + time * packet.speed) % 1
      packets.setMatrixAt(index, packetMatrix.makeTranslation(rows[packet.row].x, pipeY, pipeStartZ + 0.2 + progress * (pipeLength - 0.4)))
    })
    packets.instanceMatrix.needsUpdate = true
    endBarEmitter.set(0.8 + glow)
  }

  function dispose(): void {
    disposeTree(root)
  }

  return { id: 'backend', root, proxies: [], update, dispose }
}
