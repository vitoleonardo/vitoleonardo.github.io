import { BoxGeometry, Group, Matrix4, Mesh, type BufferGeometry } from 'three'
import { block, blockBetween, composeMatrix, instances, merge, strut } from '../geometry'
import { createEmitter, glassMaterial, steelMaterial, towerSpec, type Emitter } from '../floors/kit'
import type { Vec3 } from '../types'

const wall = towerSpec.halfSize + towerSpec.wallThickness
const slabFront = towerSpec.halfSize + 0.15
const standoff = 0.35
const grid = wall + standoff
const member = 0.16
const ringBeam = { height: 0.14, depth: 0.26 } as const
const column = 0.26
const node = { size: 0.42, depth: 0.2 } as const
const crown = towerSpec.roof + 2.6
const bays = 4
const deck = { halfDepth: 4.3, level: 5 } as const
const skinOffset = 0.2
const nodeLamp = 0.16
const nodeLampColor = '#9FB4FF'

type Face = 'west' | 'east' | 'back'

interface FaceFrame {
  face: Face
  start: number
  end: number
}

const frames: readonly FaceFrame[] = [
  { face: 'west', start: -grid, end: slabFront },
  { face: 'east', start: -grid, end: slabFront },
  { face: 'back', start: -grid, end: grid },
]

function onFace(face: Face, along: number, y: number, outward = 0): Vec3 {
  if (face === 'west') return [-grid - outward, y, along]
  if (face === 'east') return [grid + outward, y, along]
  return [along, y, -grid - outward]
}

function blockedByDeck(face: Face, along: number, level: number): boolean {
  return face === 'east' && level === deck.level && Math.abs(along) < deck.halfDepth
}

function diagridGeometry(): BufferGeometry {
  const pieces: BufferGeometry[] = []
  for (const { face, start, end } of frames) {
    const pitch = (end - start) / bays
    const stations = Array.from({ length: bays + 1 }, (_, bay) => start + bay * pitch)
    for (let level = 0; level < towerSpec.levels - 1; level += 1) {
      const low = level * towerSpec.floorHeight
      const high = low + towerSpec.floorHeight
      for (let bay = 0; bay < bays; bay += 1) {
        const [from, to] = [stations[bay], stations[bay + 1]]
        const blocked = blockedByDeck(face, from, level) || blockedByDeck(face, to, level) || blockedByDeck(face, from, level + 1) || blockedByDeck(face, to, level + 1)
        if (blocked) continue
        pieces.push(strut(onFace(face, from, low), onFace(face, to, high), member))
        pieces.push(strut(onFace(face, to, low), onFace(face, from, high), member))
      }
    }
    for (let level = 1; level < towerSpec.levels; level += 1) {
      const y = level * towerSpec.floorHeight
      const keep = stations.filter((station) => !blockedByDeck(face, station, level))
      for (const station of stations) {
        if (!keep.includes(station)) continue
        const [x, , z] = onFace(face, station, y)
        const flat: Vec3 = face === 'back' ? [node.size, node.size, node.depth] : [node.depth, node.size, node.size]
        pieces.push(block(flat, [x, y, z]))
      }
      if (face === 'back') {
        pieces.push(blockBetween([-grid, y - ringBeam.height / 2, -grid - ringBeam.depth / 2], [grid, y + ringBeam.height / 2, -grid + ringBeam.depth / 2]))
        continue
      }
      const sign = face === 'west' ? -1 : 1
      const spans: (readonly [number, number])[] = blockedByDeck(face, 0, level)
        ? [[-grid, -deck.halfDepth], [deck.halfDepth, slabFront]]
        : [[-grid, slabFront]]
      for (const [from, to] of spans) {
        pieces.push(blockBetween([sign * grid - ringBeam.depth / 2, y - ringBeam.height / 2, from], [sign * grid + ringBeam.depth / 2, y + ringBeam.height / 2, to]))
      }
    }
  }
  for (const { face, start, end } of frames) {
    const pitch = (end - start) / bays
    for (let bay = 0; bay < bays; bay += 1) {
      const [from, to] = [start + bay * pitch, start + (bay + 1) * pitch]
      pieces.push(strut(onFace(face, from, towerSpec.roof), onFace(face, to, crown), member * 0.8))
      pieces.push(strut(onFace(face, to, towerSpec.roof), onFace(face, from, crown), member * 0.8))
    }
  }
  for (const [x, z] of [[-grid, -grid], [grid, -grid], [-grid, slabFront], [grid, slabFront]] as const) {
    pieces.push(block([column, crown, column], [x, crown / 2, z]))
  }
  for (const z of [-grid, slabFront]) {
    pieces.push(blockBetween([-grid - column / 2, crown - 0.3, z - column / 2], [grid + column / 2, crown, z + column / 2]))
  }
  for (const sign of [-1, 1]) {
    pieces.push(blockBetween([sign * grid - column / 2, crown - 0.3, -grid], [sign * grid + column / 2, crown, slabFront + column / 2]))
  }
  return merge(pieces)
}

function skinGeometry(): BufferGeometry {
  const skin = wall + skinOffset
  const top = towerSpec.roof - towerSpec.slabThickness
  const deckSill = deck.level * towerSpec.floorHeight - towerSpec.slabThickness - 0.1
  return merge([
    blockBetween([-skin - 0.01, 0.2, -skin], [-skin + 0.01, top, slabFront - 0.1]),
    blockBetween([skin - 0.01, 0.2, -skin], [skin + 0.01, top, -deck.halfDepth]),
    blockBetween([skin - 0.01, 0.2, deck.halfDepth], [skin + 0.01, top, slabFront - 0.1]),
    blockBetween([skin - 0.01, 0.2, -deck.halfDepth], [skin + 0.01, deckSill, deck.halfDepth]),
    blockBetween([-skin, 0.2, -skin - 0.01], [skin, top, -skin + 0.01]),
  ])
}

function nodeLightMatrices(): Matrix4[] {
  const matrices: Matrix4[] = []
  for (const { face, start, end } of frames) {
    const pitch = (end - start) / bays
    for (let level = 1; level < towerSpec.levels; level += 1) {
      const y = level * towerSpec.floorHeight
      for (let bay = 0; bay <= bays; bay += 1) {
        const station = start + bay * pitch
        if (blockedByDeck(face, station, level)) continue
        const [x, , z] = onFace(face, station, y, node.depth / 2)
        const flat: Vec3 = face === 'back' ? [nodeLamp, nodeLamp, 0.03] : [0.03, nodeLamp, nodeLamp]
        matrices.push(composeMatrix([x, y, z], [0, 0, 0], flat))
      }
    }
  }
  return matrices
}

export interface Exoskeleton {
  root: Group
  nodes: Emitter
}

export function createExoskeleton(): Exoskeleton {
  const root = new Group()
  root.name = 'exoskeleton'
  const diagrid = new Mesh(diagridGeometry(), steelMaterial({ color: '#59606B', roughness: 0.36, metalness: 0.7 }))
  diagrid.name = 'diagrid'
  diagrid.castShadow = true
  diagrid.receiveShadow = true
  const skin = new Mesh(skinGeometry(), glassMaterial(0.1))
  skin.name = 'glass-skin'
  const nodes = createEmitter(nodeLampColor, 0.5)
  const nodeLamps = instances(new BoxGeometry(1, 1, 1), nodes.material, nodeLightMatrices())
  nodeLamps.name = 'node-lamps'
  root.add(diagrid, skin, nodeLamps)
  return { root, nodes }
}
