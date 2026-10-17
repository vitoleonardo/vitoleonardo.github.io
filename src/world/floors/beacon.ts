import { ConeGeometry, CylinderGeometry, Group, Mesh, SphereGeometry, type BufferGeometry } from 'three'
import { block, merge, place, strut } from '../geometry'
import type { FloorFactory, FrameState, InteractiveProxy, Vec3 } from '../types'
import { approach, createBeamMaterial, createEmitter, createProxy, disposeTree, emphasisOf, floorBase, palette, steelMaterial } from './kit'

const mastBase: Vec3 = [-3, 0, -3]
const mastHeight = 12
const legAngles = [Math.PI / 2, (Math.PI * 7) / 6, (Math.PI * 11) / 6] as const
const baseRadius = 0.42
const topRadius = 0.2
const section = 1
const lampHeight = mastHeight + 0.35
const beamLength = 10
const beamRadius = 1.4
const flashPeriod = 2
const beamTurnsPerSecond = 0.055

function legPoint(leg: number, height: number): Vec3 {
  const radius = baseRadius + (topRadius - baseRadius) * (height / mastHeight)
  const angle = legAngles[leg]
  return [mastBase[0] + Math.cos(angle) * radius, height, mastBase[2] + Math.sin(angle) * radius]
}

function mastGeometry(): BufferGeometry {
  const pieces: BufferGeometry[] = [block([1.2, 0.1, 1.2], [mastBase[0], 0.05, mastBase[2]])]
  for (let height = 0; height < mastHeight; height += section) {
    const next = height + section
    legAngles.forEach((_, leg) => {
      const following = (leg + 1) % legAngles.length
      pieces.push(strut(legPoint(leg, height), legPoint(leg, next), 0.05))
      pieces.push(strut(legPoint(leg, next), legPoint(following, next), 0.025))
      pieces.push(strut(legPoint(leg, height), legPoint(following, next), 0.02))
    })
  }
  for (const [height, reach] of [[9, 0.9], [10.5, 0.7]] as const) {
    pieces.push(strut([mastBase[0] - reach, height, mastBase[2]], [mastBase[0] + reach, height, mastBase[2]], 0.03))
    pieces.push(strut([mastBase[0], height, mastBase[2] - reach], [mastBase[0], height, mastBase[2] + reach], 0.03))
  }
  pieces.push(place(new CylinderGeometry(0.45, 0.45, 0.06, 20), [mastBase[0], 7, mastBase[2] + 0.35], [Math.PI / 2, 0, 0]))
  pieces.push(place(new CylinderGeometry(0.16, 0.18, 0.25, 16), [mastBase[0], mastHeight + 0.12, mastBase[2]]))
  return merge(pieces)
}

function beamGeometry(): BufferGeometry {
  const outward = place(new ConeGeometry(beamRadius, beamLength, 24, 1, true), [beamLength / 2, 0, 0], [0, 0, Math.PI / 2])
  const backward = place(new ConeGeometry(beamRadius, beamLength, 24, 1, true), [-beamLength / 2, 0, 0], [0, 0, -Math.PI / 2])
  return merge([outward, backward])
}

export const createBeaconFloor: FloorFactory = () => {
  const root = new Group()
  root.name = 'beacon'
  root.position.y = floorBase.beacon

  const mast = new Mesh(mastGeometry(), steelMaterial())
  mast.castShadow = true

  const lensEmitter = createEmitter(palette.warm, 1.5)
  const lens = new Mesh(new SphereGeometry(0.14, 16, 12), lensEmitter.material)
  lens.position.set(mastBase[0], lampHeight, mastBase[2])

  const beamMaterial = createBeamMaterial(palette.warm, true, 2.2)
  const beam = new Mesh(beamGeometry(), beamMaterial)
  beam.position.copy(lens.position)

  let emphasis = 0
  let target = 0
  const proxy: InteractiveProxy = createProxy({
    id: 'say-hi-beacon',
    chapters: ['say-hi'],
    geometry: new SphereGeometry(1, 12, 8),
    position: [mastBase[0], lampHeight, mastBase[2]],
    onState(state) {
      target = emphasisOf(state)
    },
  })

  root.add(mast, lens, beam, proxy.object)

  let frozenTime = 0

  function update(frame: FrameState): void {
    const time = frame.reducedMotion ? frozenTime : frame.time
    frozenTime = time
    emphasis = frame.reducedMotion ? target : approach(emphasis, target, 10, frame.dt)
    const phase = (time % flashPeriod) / flashPeriod
    const flash = frame.reducedMotion ? 0.4 : Math.exp(-phase * 7)
    lensEmitter.set(0.8 + flash * (2.6 + emphasis * 3))
    beam.rotation.y = time * beamTurnsPerSecond * Math.PI * 2
    beamMaterial.uniforms.uIntensity.value = 0.18 + flash * 0.25 + emphasis * 0.35 - frame.world.dawn * 0.1
  }

  function dispose(): void {
    disposeTree(root)
  }

  return { id: 'beacon', root, proxies: [proxy], update, dispose }
}
