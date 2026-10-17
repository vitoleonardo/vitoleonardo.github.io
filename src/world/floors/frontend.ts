import { BoxGeometry, ConeGeometry, Group, Mesh, MeshStandardMaterial, PlaneGeometry, SphereGeometry, type BufferGeometry, type Texture } from 'three'
import { block, blockBetween, cylinderBetween, createRandom, merge, place, strut } from '../geometry'
import type { FloorFactory, FrameState, InteractiveProxy, SharedTextures, Vec3 } from '../types'
import { approach, createEmitter, createProxy, disposeTree, emphasisOf, floorBase, palette, steelMaterial, towerSpec } from './kit'

type WorkKey = keyof SharedTextures['work']

interface ScreenSpec {
  id: string
  work: WorkKey
  position: Vec3
  rotationY: number
}

const screenSpecs: readonly ScreenSpec[] = [
  { id: 'frontend-hih', work: 'hih', position: [-2.5, 0, -1.3], rotationY: 0.42 },
  { id: 'frontend-baysal', work: 'baysal', position: [1.2, 0, -3.5], rotationY: 0 },
  { id: 'frontend-fakhari', work: 'fakhari', position: [4.7, 0, -1.1], rotationY: -0.42 },
]
const screenWidth = 3.2
const screenHeight = 2
const screenBottom = 0.75
const ceiling = towerSpec.floorHeight - towerSpec.slabThickness
const desks: readonly (readonly [number, number])[] = [[-3.6, 2.6], [-3.6, 4.9], [3.8, 2.6], [3.8, 4.9]]
const deskTop = 0.75

interface Screen {
  panel: Group
  material: MeshStandardMaterial
  emphasis: number
  target: number
}

function screenLegGeometry(): BufferGeometry[] {
  const legs: BufferGeometry[] = []
  for (const spec of screenSpecs) {
    for (const offset of [-screenWidth / 2 + 0.3, screenWidth / 2 - 0.3]) {
      const leg = merge([block([0.07, screenBottom + 0.2, 0.07], [offset, (screenBottom + 0.2) / 2, -0.06]), block([0.08, 0.04, 0.8], [offset, 0.02, -0.06])])
      legs.push(place(leg, spec.position, [0, spec.rotationY, 0]))
    }
  }
  return legs
}

function deskGeometry(): { tops: BufferGeometry; steel: BufferGeometry; monitors: BufferGeometry; bulbs: BufferGeometry } {
  const tops: BufferGeometry[] = []
  const steel: BufferGeometry[] = []
  const monitors: BufferGeometry[] = []
  const bulbs: BufferGeometry[] = []
  for (const [x, z] of desks) {
    tops.push(block([2.4, 0.05, 0.8], [x, deskTop, z]))
    for (const dx of [-1.12, 1.12]) {
      for (const dz of [-0.34, 0.34]) steel.push(block([0.05, deskTop - 0.025, 0.05], [x + dx, (deskTop - 0.025) / 2, z + dz]))
    }
    for (const dx of [-0.45, 0.45]) {
      monitors.push(block([0.58, 0.35, 0.03], [x + dx, deskTop + 0.33, z - 0.24]))
      steel.push(block([0.04, 0.16, 0.04], [x + dx, deskTop + 0.1, z - 0.26]))
    }
    for (const dx of [-0.6, 0.6]) {
      steel.push(cylinderBetween([x + dx, 0, z + 0.75], [x + dx, 0.6, z + 0.75], 0.025, 8))
      steel.push(place(new SphereGeometry(0.2, 12, 4, 0, Math.PI * 2, 0, Math.PI / 2), [x + dx, 0.6, z + 0.75], [0, 0, 0], [1, 0.25, 1]))
    }
    steel.push(strut([x, ceiling, z], [x, 2.78, z], 0.012))
    steel.push(place(new ConeGeometry(0.3, 0.26, 20, 1, true), [x, 2.66, z]))
    bulbs.push(place(new SphereGeometry(0.08, 12, 8), [x, 2.56, z]))
  }
  const random = createRandom(5)
  for (let shelf = 0; shelf < 4; shelf += 1) {
    const y = 0.4 + shelf * 0.62
    steel.push(blockBetween([-3.6, y, -6.95], [6.6, y + 0.04, -6.45]))
    for (let item = 0; item < 6; item += 1) {
      const width = 0.25 + random() * 0.5
      const height = 0.15 + random() * 0.35
      tops.push(block([width, height, 0.35], [-3.2 + random() * 9.4, y + 0.04 + height / 2, -6.7]))
    }
  }
  for (const x of [-3.6, -0.2, 3.2, 6.6]) steel.push(blockBetween([x - 0.03, 0, -6.95], [x + 0.03, 2.4, -6.45]))
  return { tops: merge(tops), steel: merge([...steel, ...screenLegGeometry()]), monitors: merge(monitors), bulbs: merge(bulbs) }
}

export const createFrontendFloor: FloorFactory = (context) => {
  const { textures } = context
  const root = new Group()
  root.name = 'frontend'
  root.position.y = floorBase.frontend

  const steel = steelMaterial()
  const parts = deskGeometry()
  const furniture = new Mesh(parts.steel, steel)
  const worktops = new Mesh(parts.tops, new MeshStandardMaterial({ color: '#3B352E', roughness: 0.58, metalness: 0 }))
  const monitorMaterial = new MeshStandardMaterial({
    color: '#11141B',
    emissive: '#6F86E8',
    emissiveMap: textures.blueprint,
    roughness: 0.32,
    metalness: 0,
  })
  const monitors = new Mesh(parts.monitors, monitorMaterial)
  const bulbEmitter = createEmitter(palette.warm, 2)
  const bulbs = new Mesh(parts.bulbs, bulbEmitter.material)
  furniture.castShadow = true
  worktops.castShadow = true
  worktops.receiveShadow = true

  const backingGeometry = new BoxGeometry(screenWidth + 0.16, screenHeight + 0.16, 0.08)
  const screenGeometry = new PlaneGeometry(screenWidth, screenHeight)
  const screens: Screen[] = []
  const proxies: InteractiveProxy[] = []

  screenSpecs.forEach((spec) => {
    const texture: Texture = textures.work[spec.work]
    const material = new MeshStandardMaterial({
      map: texture,
      emissiveMap: texture,
      emissive: '#ffffff',
      emissiveIntensity: 0.5,
      roughness: 0.16,
      metalness: 0,
    })
    const holder = new Group()
    holder.position.set(...spec.position)
    holder.rotation.y = spec.rotationY
    const panel = new Group()
    const backing = new Mesh(backingGeometry, steel)
    backing.position.set(0, screenBottom + screenHeight / 2, -0.05)
    backing.castShadow = true
    const surface = new Mesh(screenGeometry, material)
    surface.position.set(0, screenBottom + screenHeight / 2, 0)
    panel.add(backing, surface)
    holder.add(panel)
    root.add(holder)
    const screen: Screen = { panel, material, emphasis: 0, target: 0 }
    screens.push(screen)
    proxies.push(
      createProxy({
        id: spec.id,
        chapters: ['stop-frontend'],
        geometry: new BoxGeometry(screenWidth + 0.2, screenHeight + 0.2, 0.3),
        position: [spec.position[0], screenBottom + screenHeight / 2, spec.position[2]],
        rotationY: spec.rotationY,
        onState(state) {
          screen.target = emphasisOf(state)
        },
      }),
    )
  })

  root.add(furniture, worktops, monitors, bulbs, ...proxies.map((proxy) => proxy.object))

  function update(frame: FrameState): void {
    const { practicals } = frame.world
    bulbEmitter.set(0.4 + practicals * 2.2)
    monitorMaterial.emissiveIntensity = 0.15 + practicals * 0.35
    for (const screen of screens) {
      screen.emphasis = frame.reducedMotion ? screen.target : approach(screen.emphasis, screen.target, 9, frame.dt)
      screen.material.emissiveIntensity = 0.3 + practicals * 0.3 + screen.emphasis * 0.9
      screen.panel.position.y = screen.emphasis * 0.22
      screen.panel.position.z = screen.emphasis * 0.12
    }
  }

  function dispose(): void {
    disposeTree(root)
  }

  return { id: 'frontend', root, proxies, update, dispose }
}
