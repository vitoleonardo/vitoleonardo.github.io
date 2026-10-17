import { Color, ConeGeometry, CylinderGeometry, Group, LatheGeometry, Mesh, SphereGeometry, TorusGeometry, Vector2, type BufferGeometry } from 'three'
import { block, cylinderBetween, merge, place, projectWorldUVs } from '../geometry'
import type { FloorFactory, FrameState, InteractiveProxy, Vec3 } from '../types'
import {
  approach,
  concreteMaterial,
  createBeamMaterial,
  createEmitter,
  createHaloMaterial,
  createProxy,
  disposeTree,
  emphasisOf,
  floorBase,
  palette,
  steelMaterial,
} from './kit'
import { breathe, createSceneClock } from './kit-upper'

const mastBase: Vec3 = [-3, 0, -3]
const plinthHeight = 0.35
const mastHeight = 12
const legAngles = [Math.PI / 2, (Math.PI * 7) / 6, (Math.PI * 11) / 6] as const
const baseRadius = 0.46
const topRadius = 0.2
const section = 1.2
const platformHeight = 9
const lampHeight = mastHeight + 0.42
const beamLength = 11
const beamRadius = 1.2
const beamTurnsPerSecond = 1 / 24
const lensBreathSeconds = 5.2
const lensBreathDepth = 0.08
const rungSpacing = 0.3

function legRadius(height: number): number {
  return baseRadius + (topRadius - baseRadius) * (height / mastHeight)
}

function legPoint(leg: number, height: number, inset = 0): Vec3 {
  const radius = legRadius(height) - inset
  const angle = legAngles[leg]
  return [mastBase[0] + Math.cos(angle) * radius, plinthHeight + height, mastBase[2] + Math.sin(angle) * radius]
}

function latticeGeometry(): BufferGeometry {
  const pieces: BufferGeometry[] = []
  for (let height = 0; height < mastHeight - 1e-3; height += section) {
    const next = Math.min(mastHeight, height + section)
    legAngles.forEach((_, leg) => {
      const following = (leg + 1) % legAngles.length
      pieces.push(cylinderBetween(legPoint(leg, height), legPoint(leg, next), 0.042 - height * 0.0015, 10))
      pieces.push(place(new CylinderGeometry(0.075, 0.075, 0.025, 12), legPoint(leg, next)))
      pieces.push(cylinderBetween(legPoint(leg, next, 0.02), legPoint(following, next, 0.02), 0.018, 6))
      pieces.push(cylinderBetween(legPoint(leg, height + 0.06, 0.02), legPoint(following, next - 0.06, 0.02), 0.013, 6))
      pieces.push(cylinderBetween(legPoint(following, height + 0.06, 0.02), legPoint(leg, next - 0.06, 0.02), 0.013, 6))
    })
  }
  legAngles.forEach((_, leg) => {
    pieces.push(place(new CylinderGeometry(0.12, 0.12, 0.02, 12), legPoint(leg, 0.01)))
    for (const offset of [-0.07, 0.07]) {
      const [x, y, z] = legPoint(leg, 0.03)
      pieces.push(place(new CylinderGeometry(0.012, 0.012, 0.05, 6), [x + offset, y, z + offset]))
    }
  })
  return merge(pieces)
}

function ladderGeometry(): BufferGeometry {
  const pieces: BufferGeometry[] = []
  const outward = legAngles[0]
  const offset = (radius: number, height: number, side: number): Vec3 => [
    mastBase[0] + Math.cos(outward) * (radius + 0.18) + side * 0.2,
    plinthHeight + height,
    mastBase[2] + Math.sin(outward) * (radius + 0.18),
  ]
  for (const side of [-1, 1]) pieces.push(cylinderBetween(offset(baseRadius, 0.2, side), offset(legRadius(platformHeight), platformHeight, side), 0.014, 6))
  for (let height = 0.45; height < platformHeight - 0.1; height += rungSpacing) {
    const radius = legRadius(height)
    pieces.push(cylinderBetween(offset(radius, height, -1), offset(radius, height, 1), 0.01, 5))
  }
  for (let height = 2.4; height < platformHeight; height += 0.9) {
    const radius = legRadius(height)
    const [x, y, z] = offset(radius, height, 0)
    pieces.push(place(new TorusGeometry(0.34, 0.012, 5, 20, Math.PI), [x, y, z - 0.14], [Math.PI / 2, 0, 0]))
  }
  return merge(pieces)
}

function fittingsGeometry(): BufferGeometry {
  const pieces: BufferGeometry[] = []
  const platformY = plinthHeight + platformHeight
  pieces.push(place(new CylinderGeometry(0.95, 0.95, 0.04, 32), [mastBase[0], platformY, mastBase[2]]))
  pieces.push(place(new TorusGeometry(0.95, 0.018, 6, 40), [mastBase[0], platformY + 1, mastBase[2]], [Math.PI / 2, 0, 0]))
  pieces.push(place(new TorusGeometry(0.95, 0.012, 6, 40), [mastBase[0], platformY + 0.5, mastBase[2]], [Math.PI / 2, 0, 0]))
  for (let post = 0; post < 8; post += 1) {
    const angle = (post / 8) * Math.PI * 2
    const x = mastBase[0] + Math.cos(angle) * 0.95
    const z = mastBase[2] + Math.sin(angle) * 0.95
    pieces.push(cylinderBetween([x, platformY, z], [x, platformY + 1, z], 0.016, 6))
  }
  for (const height of [7, 10.6]) {
    legAngles.forEach((_, leg) => {
      const [x, y, z] = legPoint(leg, height)
      const angle = legAngles[leg]
      pieces.push(cylinderBetween([x, y, z], [x + Math.cos(angle) * 0.22, y, z + Math.sin(angle) * 0.22], 0.02, 6))
    })
  }
  const topY = plinthHeight + mastHeight
  pieces.push(place(new CylinderGeometry(0.26, 0.26, 0.04, 20), [mastBase[0], topY + 0.02, mastBase[2]]))
  pieces.push(place(new CylinderGeometry(0.15, 0.17, 0.16, 20), [mastBase[0], topY + 0.12, mastBase[2]]))
  pieces.push(place(new CylinderGeometry(0.17, 0.15, 0.05, 20), [mastBase[0], lampHeight + plinthHeight + 0.17, mastBase[2]]))
  pieces.push(place(new ConeGeometry(0.16, 0.12, 20), [mastBase[0], lampHeight + plinthHeight + 0.25, mastBase[2]]))
  pieces.push(cylinderBetween([mastBase[0], lampHeight + plinthHeight + 0.3, mastBase[2]], [mastBase[0], lampHeight + plinthHeight + 1.5, mastBase[2]], 0.012, 6))
  for (const side of [-1, 1]) {
    const x = mastBase[0] + side * 0.2
    pieces.push(cylinderBetween([x, topY - 0.6, mastBase[2] + 0.12], [x, topY + 0.9, mastBase[2] + 0.12], 0.008, 5))
  }
  const dishCentre: Vec3 = [mastBase[0], plinthHeight + 7.6, mastBase[2] + 0.62]
  const dish = new LatheGeometry(Array.from({ length: 9 }, (_, step) => {
    const radius = (step / 8) * 0.48
    return new Vector2(radius, radius * radius * 0.7)
  }), 32)
  pieces.push(place(dish, dishCentre, [Math.PI / 2 + 0.12, 0, 0]))
  pieces.push(cylinderBetween(dishCentre, [dishCentre[0], dishCentre[1] + 0.08, dishCentre[2] + 0.42], 0.01, 5))
  pieces.push(cylinderBetween([mastBase[0], dishCentre[1], mastBase[2] + 0.2], [dishCentre[0], dishCentre[1], dishCentre[2] - 0.08], 0.03, 8))
  return merge(pieces)
}

function radomeGeometry(): BufferGeometry {
  const pieces: BufferGeometry[] = []
  legAngles.forEach((angle, leg) => {
    const [x, , z] = legPoint(leg, 6.4)
    const outX = Math.cos(angle) * 0.24
    const outZ = Math.sin(angle) * 0.24
    pieces.push(block([0.28, 1.25, 0.09], [x + outX, plinthHeight + 6.4, z + outZ], [0, -angle + Math.PI / 2, 0]))
  })
  return merge(pieces)
}

function beamGeometry(): BufferGeometry {
  const outward = place(new ConeGeometry(beamRadius, beamLength, 28, 1, true), [beamLength / 2, 0, 0], [0, 0, Math.PI / 2])
  const backward = place(new ConeGeometry(beamRadius, beamLength, 28, 1, true), [-beamLength / 2, 0, 0], [0, 0, -Math.PI / 2])
  return merge([outward, backward])
}

export const createBeaconFloor: FloorFactory = (context) => {
  const { textures } = context
  const root = new Group()
  root.name = 'beacon'
  root.position.y = floorBase.beacon

  const galvanised = steelMaterial({ color: '#7C828A', roughness: 0.52, metalness: 0.85 })
  const lattice = new Mesh(merge([latticeGeometry(), ladderGeometry(), fittingsGeometry(), radomeGeometry()]), galvanised)
  lattice.castShadow = true
  const plinth = new Mesh(projectWorldUVs(block([1.5, plinthHeight, 1.5], [mastBase[0], plinthHeight / 2, mastBase[2]]), 1.5), concreteMaterial(textures))
  plinth.receiveShadow = true

  const lampY = lampHeight + plinthHeight
  const lensEmitter = createEmitter(palette.warm, 1)
  const lens = new Mesh(new CylinderGeometry(0.075, 0.075, 0.2, 20), lensEmitter.material)
  lens.position.set(mastBase[0], lampY, mastBase[2])
  const haloMaterial = createHaloMaterial(palette.warm, 2.4)
  const halo = new Mesh(new SphereGeometry(0.75, 24, 16), haloMaterial)
  halo.position.copy(lens.position)
  halo.renderOrder = 3

  const beamMaterial = createBeamMaterial(palette.warm, true, 2.2)
  const beam = new Mesh(beamGeometry(), beamMaterial)
  beam.position.copy(lens.position)
  beam.renderOrder = 3

  let emphasis = 0
  let target = 0
  const proxy: InteractiveProxy = createProxy({
    id: 'say-hi-beacon',
    chapters: ['say-hi'],
    geometry: new SphereGeometry(1, 12, 8),
    position: [mastBase[0], lampY, mastBase[2]],
    onState(state) {
      target = emphasisOf(state)
    },
  })

  root.add(plinth, lattice, lens, halo, beam, proxy.object)

  const clock = createSceneClock()
  const lensColor = new Color(palette.warm)

  function update(frame: FrameState): void {
    const time = clock(frame)
    emphasis = frame.reducedMotion ? target : approach(emphasis, target, 5, frame.dt)
    const calm = frame.reducedMotion ? 1 : breathe(time, lensBreathSeconds, lensBreathDepth)
    const daylight = frame.world.dawn
    lensEmitter.set((2.2 + emphasis * 1.6) * calm, lensColor)
    haloMaterial.uniforms.uIntensity.value = (0.32 + emphasis * 0.3) * calm * (1 - daylight * 0.4)
    beam.rotation.y = time * beamTurnsPerSecond * Math.PI * 2
    beamMaterial.uniforms.uIntensity.value = (0.1 + emphasis * 0.12) * (1 - daylight * 0.55)
  }

  function dispose(): void {
    disposeTree(root)
  }

  return { id: 'beacon', root, proxies: [proxy], update, dispose }
}
