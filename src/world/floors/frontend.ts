import {
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Points,
  ShaderMaterial,
  SphereGeometry,
  TorusGeometry,
} from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { block, blockBetween, composeMatrix, createRandom, cylinderBetween, instances, merge, place, strut, tintVertices } from '../geometry'
import { averageTextureColor, createGlowTexture } from '../textures'
import type { FloorFactory, FrameState, InteractiveProxy, SharedTextures, Vec3 } from '../types'
import {
  approach,
  brassMaterial,
  bulbEmitter,
  createBeamMaterial,
  createHaloMaterial,
  createProxy,
  disposeTree,
  emphasisOf,
  floorBase,
  luminance,
  palette,
  screenMaterial,
  steelMaterial,
  towerSpec,
  withSurfaceBreakup,
} from './kit'

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
const desk = { width: 2.4, depth: 0.8, thickness: 0.04, bevel: 0.009 }
const shade = { radius: 0.3, height: 0.26, rim: 2.53 }
const bulbRadius = 0.065
const bulbY = 2.59
const haloRadius = 0.32
const beam = { topRadius: 0.27, bottomRadius: 1.05, top: shade.rim, bottom: deskTop + 0.03 }
const screenFallbackColor = '#E9E5DB'
const shelfItemColors = ['#8C7A62', '#C9C2B3', '#4A5466', '#7A3F33', '#2F3A33', '#B59A6A'] as const
const dustPerCone = 90
const dustFallSpeed = 0.025

const worktopBreakup = { cellsPerMetre: 3, roughnessSwing: 0.12, albedoSwing: 0.08, verticalStretch: 1 }

interface Screen {
  panel: Group
  material: MeshStandardMaterial
  emphasis: number
  target: number
}

interface DeskParts {
  tops: BufferGeometry
  frames: BufferGeometry
  brass: BufferGeometry
  monitorBodies: BufferGeometry
  monitorFaces: BufferGeometry
  glowing: BufferGeometry
  shelfItems: BufferGeometry
}

function screenLegGeometry(): BufferGeometry[] {
  const legs: BufferGeometry[] = []
  for (const spec of screenSpecs) {
    for (const offset of [-screenWidth / 2 + 0.3, screenWidth / 2 - 0.3]) {
      const leg = merge([
        block([0.06, screenBottom + 0.2, 0.06], [offset, (screenBottom + 0.2) / 2, -0.06]),
        new RoundedBoxGeometry(0.1, 0.035, 0.8, 2, 0.008).translate(offset, 0.0175, -0.06),
      ])
      legs.push(place(leg, spec.position, [0, spec.rotationY, 0]))
    }
  }
  return legs
}

function deskFrame(x: number, z: number): BufferGeometry[] {
  const halfWidth = desk.width / 2 - 0.08
  const halfDepth = desk.depth / 2 - 0.05
  const railY = deskTop - desk.thickness - 0.03
  const legHeight = railY - 0.03
  const pieces: BufferGeometry[] = []
  for (const side of [-1, 1]) {
    pieces.push(block([desk.width - 0.16, 0.06, 0.03], [x, railY, z + side * halfDepth]))
    pieces.push(block([0.03, 0.06, desk.depth - 0.1], [x + side * halfWidth, railY, z]))
    for (const end of [-1, 1]) {
      pieces.push(block([0.045, legHeight, 0.045], [x + side * halfWidth, legHeight / 2 + 0.012, z + end * halfDepth]))
    }
  }
  return pieces
}

function stool(x: number, z: number): { frame: BufferGeometry[]; seat: BufferGeometry } {
  return {
    frame: [
      cylinderBetween([x, 0.02, z], [x, 0.6, z], 0.024, 10),
      place(new CylinderGeometry(0.2, 0.21, 0.025, 20), [x, 0.0125, z]),
      place(new TorusGeometry(0.15, 0.011, 6, 28), [x, 0.26, z], [Math.PI / 2, 0, 0]),
    ],
    seat: place(new CylinderGeometry(0.18, 0.17, 0.045, 24), [x, 0.6225, z]),
  }
}

function pendant(x: number, z: number): { steel: BufferGeometry[]; brass: BufferGeometry[]; glowing: BufferGeometry[] } {
  const apex = shade.rim + shade.height
  return {
    steel: [
      strut([x, ceiling, z], [x, apex + 0.05, z], 0.008),
      place(new ConeGeometry(shade.radius, shade.height, 28, 1, true), [x, shade.rim + shade.height / 2, z]),
    ],
    brass: [
      place(new CylinderGeometry(0.06, 0.07, 0.03, 20), [x, ceiling - 0.015, z]),
      place(new CylinderGeometry(0.035, 0.04, 0.07, 16), [x, apex + 0.02, z]),
    ],
    glowing: [
      tintVertices(place(new SphereGeometry(bulbRadius, 16, 10), [x, bulbY, z]), new Color(1, 1, 1)),
      tintVertices(
        place(new ConeGeometry(shade.radius * 0.96, shade.height * 0.96, 28, 1, true), [x, shade.rim + shade.height / 2 + 0.004, z]),
        new Color(1, 1, 1).multiplyScalar(luminance.shadeInterior / luminance.bulb),
      ),
    ],
  }
}

function deskGeometry(): DeskParts {
  const tops: BufferGeometry[] = []
  const frames: BufferGeometry[] = []
  const brass: BufferGeometry[] = []
  const monitorBodies: BufferGeometry[] = []
  const monitorFaces: BufferGeometry[] = []
  const glowing: BufferGeometry[] = []
  for (const [x, z] of desks) {
    tops.push(new RoundedBoxGeometry(desk.width, desk.thickness, desk.depth, 2, desk.bevel).translate(x, deskTop - desk.thickness / 2, z))
    frames.push(...deskFrame(x, z))
    for (const dx of [-0.45, 0.45]) {
      monitorBodies.push(new RoundedBoxGeometry(0.6, 0.37, 0.03, 2, 0.006).translate(x + dx, deskTop + 0.34, z - 0.24))
      monitorBodies.push(block([0.04, 0.16, 0.03], [x + dx, deskTop + 0.1, z - 0.27]))
      monitorBodies.push(new RoundedBoxGeometry(0.22, 0.012, 0.16, 2, 0.004).translate(x + dx, deskTop + 0.006, z - 0.25))
      monitorFaces.push(place(new PlaneGeometry(0.56, 0.33), [x + dx, deskTop + 0.34, z - 0.24 + 0.0155]))
    }
    for (const dx of [-0.6, 0.6]) {
      const seat = stool(x + dx, z + 0.75)
      frames.push(...seat.frame)
      tops.push(seat.seat)
    }
    const lamp = pendant(x, z)
    frames.push(...lamp.steel)
    brass.push(...lamp.brass)
    glowing.push(...lamp.glowing)
  }
  const random = createRandom(5)
  const shelfItems: BufferGeometry[] = []
  for (let shelf = 0; shelf < 4; shelf += 1) {
    const y = 0.4 + shelf * 0.62
    frames.push(blockBetween([-3.6, y, -6.95], [6.6, y + 0.03, -6.45]))
    for (let item = 0; item < 6; item += 1) {
      const width = 0.25 + random() * 0.5
      const height = 0.15 + random() * 0.35
      const color = shelfItemColors[Math.floor(random() * shelfItemColors.length)]
      shelfItems.push(tintVertices(block([width, height, 0.35], [-3.2 + random() * 9.4, y + 0.03 + height / 2, -6.7]), color))
    }
  }
  for (const x of [-3.6, -0.2, 3.2, 6.6]) frames.push(blockBetween([x - 0.03, 0, -6.95], [x + 0.03, 2.4, -6.45]))
  for (const x of [-3.6, -0.2, 3.2, 6.6]) brass.push(blockBetween([x - 0.035, 0, -6.96], [x + 0.035, 0.03, -6.44]))
  return {
    tops: merge(tops),
    frames: merge([...frames, ...screenLegGeometry()]),
    brass: merge(brass),
    monitorBodies: merge(monitorBodies),
    monitorFaces: merge(monitorFaces),
    glowing: merge(glowing),
    shelfItems: merge(shelfItems),
  }
}

function forwardOf(spec: ScreenSpec, distance: number): Vec3 {
  return [spec.position[0] + Math.sin(spec.rotationY) * distance, 0, spec.position[2] + Math.cos(spec.rotationY) * distance]
}

function lightPoolLayout(screenColors: readonly Color[]): { matrices: Matrix4[]; colors: Color[] } {
  const warm = new Color(palette.warm)
  const matrices: Matrix4[] = []
  const colors: Color[] = []
  for (const [x, z] of desks) {
    matrices.push(composeMatrix([x, deskTop + 0.002, z], [-Math.PI / 2, 0, 0], [desk.width - 0.04, desk.depth - 0.04, 1]))
    colors.push(warm.clone().multiplyScalar(0.42))
  }
  screenSpecs.forEach((spec, index) => {
    const [x, , z] = forwardOf(spec, 1.4)
    matrices.push(composeMatrix([x, 0.003, z], [-Math.PI / 2, 0, spec.rotationY], [screenWidth * 1.25, 3, 1]))
    colors.push(screenColors[index].clone().multiplyScalar(0.22))
  })
  return { matrices, colors }
}

const coneDustVertexShader = `
uniform float uTime;
uniform float uPixelRatio;
uniform vec4 uCone;
attribute vec2 aAxis;
attribute float aPhase;
varying float vGlow;
void main() {
  float span = uCone.x - uCone.y;
  vec3 drifted = position + vec3( sin( uTime * 0.21 + aPhase ) * 0.05, 0.0, cos( uTime * 0.17 + aPhase * 1.3 ) * 0.05 );
  drifted.y = uCone.y + mod( position.y - uCone.y - uTime * ${dustFallSpeed.toFixed(3)}, span );
  float depthInCone = ( uCone.x - drifted.y ) / span;
  float coneRadius = mix( uCone.z, uCone.w, depthInCone );
  float radial = length( drifted.xz - aAxis ) / coneRadius;
  float twinkle = 0.6 + 0.4 * sin( uTime * 1.3 + aPhase * 5.0 );
  vec4 viewPosition = modelViewMatrix * vec4( drifted, 1.0 );
  float nearCamera = 1.0 - smoothstep( 7.0, 14.0, -viewPosition.z );
  vGlow = ( 1.0 - smoothstep( 0.45, 1.0, radial ) ) * ( 1.0 - depthInCone * 0.65 ) * twinkle * nearCamera;
  gl_PointSize = clamp( 0.022 * uPixelRatio * 300.0 / -viewPosition.z, 1.0, 4.0 * uPixelRatio );
  gl_Position = projectionMatrix * viewPosition;
}
`

const coneDustFragmentShader = `
uniform vec3 uColor;
uniform float uOpacity;
varying float vGlow;
void main() {
  float radius = length( gl_PointCoord - 0.5 ) * 2.0;
  float soft = 1.0 - smoothstep( 0.15, 1.0, radius );
  gl_FragColor = vec4( uColor * soft * vGlow * uOpacity, 1.0 );
  #include <colorspace_fragment>
}
`

function createConeDust(count: number): { points: Points; material: ShaderMaterial } {
  const random = createRandom(808)
  const total = count * desks.length
  const positions = new Float32Array(total * 3)
  const axes = new Float32Array(total * 2)
  const phases = new Float32Array(total)
  desks.forEach(([x, z], cone) => {
    for (let mote = 0; mote < count; mote += 1) {
      const index = cone * count + mote
      const depth = random()
      const radius = (beam.topRadius + (beam.bottomRadius - beam.topRadius) * depth) * Math.sqrt(random())
      const angle = random() * Math.PI * 2
      positions.set([x + Math.cos(angle) * radius, beam.top - depth * (beam.top - beam.bottom), z + Math.sin(angle) * radius], index * 3)
      axes.set([x, z], index * 2)
      phases[index] = random() * Math.PI * 2
    }
  })
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setAttribute('aAxis', new Float32BufferAttribute(axes, 2))
  geometry.setAttribute('aPhase', new Float32BufferAttribute(phases, 1))
  geometry.computeBoundingSphere()
  const material = new ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uPixelRatio: { value: 1 },
      uCone: { value: [beam.top, beam.bottom, beam.topRadius, beam.bottomRadius] },
      uColor: { value: new Color('#FFD6A1') },
      uOpacity: { value: 0 },
    },
    vertexShader: coneDustVertexShader,
    fragmentShader: coneDustFragmentShader,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  })
  const points = new Points(geometry, material)
  points.renderOrder = 3
  return { points, material }
}

function haloGeometry(): BufferGeometry {
  return merge(desks.map(([x, z]) => place(new SphereGeometry(haloRadius, 20, 12), [x, bulbY, z])))
}

function beamGeometry(): BufferGeometry {
  const height = beam.top - beam.bottom
  return merge(
    desks.map(([x, z]) => place(new CylinderGeometry(beam.topRadius, beam.bottomRadius, height, 32, 1, true), [x, beam.bottom + height / 2, z])),
  )
}

export const createFrontendFloor: FloorFactory = (context) => {
  const { textures, renderer, quality } = context
  const root = new Group()
  root.name = 'frontend'
  root.position.y = floorBase.frontend

  const steel = steelMaterial()
  const parts = deskGeometry()
  const frames = new Mesh(parts.frames, steel)
  const worktopMaterial = withSurfaceBreakup(new MeshStandardMaterial({ color: '#4A4239', roughness: 0.5, metalness: 0 }), worktopBreakup)
  const worktops = new Mesh(parts.tops, worktopMaterial)
  const fittings = new Mesh(parts.brass, brassMaterial())
  const monitorBodies = new Mesh(parts.monitorBodies, steelMaterial({ color: '#1D2024', roughness: 0.38 }))
  const monitorFaceMaterial = screenMaterial(textures.blueprint, { emissive: '#8FA2F0' })
  const monitorFaces = new Mesh(parts.monitorFaces, monitorFaceMaterial)
  const shelfItems = new Mesh(parts.shelfItems, new MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0 }))
  const bulbs = bulbEmitter(palette.warm, { vertexColors: true, side: DoubleSide })
  const glowing = new Mesh(parts.glowing, bulbs.material)
  for (const mesh of [frames, worktops, fittings, monitorBodies, shelfItems]) mesh.castShadow = true
  for (const mesh of [worktops, shelfItems]) mesh.receiveShadow = true

  const beamMaterial = createBeamMaterial(palette.warm, true, 1.3)
  const beams = new Mesh(beamGeometry(), beamMaterial)
  beams.renderOrder = 2
  const haloMaterial = createHaloMaterial(palette.warm, 2.2)
  const halos = new Mesh(haloGeometry(), haloMaterial)
  halos.renderOrder = 2
  const dust = createConeDust(Math.round(dustPerCone * Math.max(quality.particles, 0.35)))

  const screenColors = screenSpecs.map((spec) => averageTextureColor(textures.work[spec.work], screenFallbackColor))
  const glow = createGlowTexture()
  const poolLayout = lightPoolLayout(screenColors)
  const poolMaterial = new MeshBasicMaterial({
    map: glow,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  })
  const pools = instances(new PlaneGeometry(1, 1), poolMaterial, poolLayout.matrices, poolLayout.colors)
  pools.renderOrder = 1

  const backingGeometry = new RoundedBoxGeometry(screenWidth + 0.16, screenHeight + 0.16, 0.08, 2, 0.02)
  const screenGeometry = new PlaneGeometry(screenWidth, screenHeight)
  const screens: Screen[] = []
  const proxies: InteractiveProxy[] = []

  screenSpecs.forEach((spec) => {
    const material = screenMaterial(textures.work[spec.work])
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

  root.add(
    frames,
    worktops,
    fittings,
    monitorBodies,
    monitorFaces,
    shelfItems,
    glowing,
    beams,
    halos,
    dust.points,
    pools,
    ...proxies.map((proxy) => proxy.object),
  )

  let frozenTime = 0

  function update(frame: FrameState): void {
    const { practicals } = frame.world
    const time = frame.reducedMotion ? frozenTime : frame.time
    frozenTime = time
    const level = 0.25 + 0.75 * practicals
    bulbs.set(luminance.bulb * level)
    poolMaterial.color.setScalar(level)
    beamMaterial.uniforms.uIntensity.value = 0.11 * level
    haloMaterial.uniforms.uIntensity.value = 0.5 * level
    dust.material.uniforms.uTime.value = time
    dust.material.uniforms.uPixelRatio.value = renderer.getPixelRatio()
    dust.material.uniforms.uOpacity.value = 0.9 * level
    monitorFaceMaterial.emissiveIntensity = luminance.screen * (0.35 + 0.4 * practicals)

    for (const screen of screens) {
      screen.emphasis = frame.reducedMotion ? screen.target : approach(screen.emphasis, screen.target, 9, frame.dt)
      screen.material.emissiveIntensity = luminance.screen * (0.7 + 0.3 * practicals) + screen.emphasis * luminance.screenEmphasis
      screen.panel.position.y = screen.emphasis * 0.22
      screen.panel.position.z = screen.emphasis * 0.12
    }
  }

  function dispose(): void {
    disposeTree(root)
    glow.dispose()
  }

  return { id: 'frontend', root, proxies, update, dispose }
}
