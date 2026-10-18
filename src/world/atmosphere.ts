import {
  AdditiveBlending,
  BackSide,
  BoxGeometry,
  BufferGeometry,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  Float32BufferAttribute,
  FogExp2,
  Group,
  HemisphereLight,
  LineSegments,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  PMREMGenerator,
  PointLight,
  Points,
  Scene,
  Vector3,
  ShaderMaterial,
  SphereGeometry,
  type WebGLRenderTarget,
} from 'three'
import { block, blockBetween, composeMatrix, createRandom, instances, merge, place } from './geometry'
import { breathing, clamp01, disposeTree, lightLaneCount, lightLedger, lightWeight, palette, smoothstep, type LedgerLight, type LightLevel } from './floors/kit'
import type { FloorContext, FloorSet, FrameState } from './types'

const fogDensityRange = [0.004, 0.03] as const
const skyRadius = 60
const rainCapacity = 5200
const dustCapacity = 1800
const rainBox = [46, 30, 46] as const
const timeWrap = 600
const keyTarget = [2, 14, 0] as const
const keyOffset = [-31, 40, 46] as const
const keyStrength = 2.5
const hemisphereStrength = 1.5
const environmentStrength = 0.85
const skyTint = '#566797'
const groundBounce = '#1D1B1E'

interface SkyStop {
  at: number
  zenith: string
  sky: string
  low: string
  horizon: string
  glow: string
  cityGlow: string
  fog: string
  haze: string
}

const skyStops: readonly SkyStop[] = [
  { at: 0, zenith: '#05080F', sky: '#0D1425', low: '#182031', horizon: '#1F2638', glow: '#000000', cityGlow: '#2B2430', fog: '#121A28', haze: '#433D50' },
  { at: 0.45, zenith: '#091235', sky: '#1B2F72', low: '#4A5F96', horizon: '#C08463', glow: '#B4643A', cityGlow: '#1C1824', fog: '#1C2848', haze: '#3A4C7E' },
  { at: 1, zenith: '#33589C', sky: '#7397C8', low: '#BAC6D6', horizon: '#EBC7A4', glow: '#B88250', cityGlow: '#000000', fog: '#56627C', haze: '#646C80' },
]

type SkyColors = Record<Exclude<keyof SkyStop, 'at'>, Color>

const skyColorKeys = ['zenith', 'sky', 'low', 'horizon', 'glow', 'cityGlow', 'fog', 'haze'] as const

function skyColorsOf(stop: SkyStop): SkyColors {
  return Object.fromEntries(skyColorKeys.map((key) => [key, new Color(stop[key])])) as SkyColors
}

const skyStopColors = skyStops.map(skyColorsOf)

function sampleSky(dawn: number, target: SkyColors): SkyColors {
  const level = clamp01(dawn)
  const upper = Math.max(1, skyStops.findIndex((stop) => stop.at >= level))
  const lower = upper - 1
  const blend = smoothstep(skyStops[lower].at, skyStops[upper].at, level)
  for (const key of skyColorKeys) target[key].copy(skyStopColors[lower][key]).lerp(skyStopColors[upper][key], blend)
  return target
}

const skyVertexShader = `
varying vec3 vDirection;
void main() {
  vDirection = position;
  vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = vec4(clip.xy, clip.w * 0.99999, clip.w);
}
`

const skyFragmentShader = `
uniform vec3 uZenith;
uniform vec3 uSky;
uniform vec3 uLow;
uniform vec3 uHorizon;
uniform vec3 uGlow;
uniform vec3 uCityGlow;
uniform vec3 uRed;
uniform vec3 uSunDirection;
uniform float uRedAmount;
varying vec3 vDirection;
void main() {
  vec3 direction = normalize(vDirection);
  float height = direction.y;
  float above = max(height, 0.0);
  vec3 color = mix(uHorizon, uLow, smoothstep(0.0, 0.09, above));
  color = mix(color, uSky, smoothstep(0.05, 0.35, above));
  color = mix(color, uZenith, smoothstep(0.25, 0.9, above));
  vec3 sun = normalize(uSunDirection);
  float towardSun = max(dot(normalize(direction.xz + vec2(1e-5, 0.0)), normalize(sun.xz)), 0.0);
  color += uGlow * pow(towardSun, 3.0) * exp(-above * 9.0);
  color += uGlow * 0.35 * pow(max(dot(direction, sun), 0.0), 60.0);
  color += uCityGlow * exp(-above * 12.0);
  color = mix(color, color * 0.55 + uRed * 0.3 * exp(-above * 5.0), uRedAmount);
  color = mix(color, uHorizon * 0.55, smoothstep(0.0, -0.12, height));
  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

const rainVertexShader = `
uniform float uTime;
uniform vec3 uBox;
uniform vec3 uWind;
uniform float uLength;
attribute float aTail;
attribute float aSpeed;
varying float vFade;
float sheltered(vec3 point) {
  float tower = step(abs(point.x), 7.6) * step(abs(point.z), 7.6) * step(point.y, 31.5);
  float deck = step(7.0, point.x) * step(point.x, 15.3) * step(abs(point.z), 4.3) * step(point.y, 20.1);
  return max(tower, deck);
}
void main() {
  vec3 origin = cameraPosition - uBox * 0.5;
  vec3 fall = vec3(uWind.x, -1.0, uWind.z) * uTime * aSpeed;
  vec3 head = origin + mod(position * uBox + fall - origin, uBox);
  vec3 streak = normalize(vec3(-uWind.x, 1.0, -uWind.z)) * uLength * aTail;
  float distanceFade = 1.0 - smoothstep(6.0, uBox.x * 0.5, distance(head, cameraPosition));
  vFade = (1.0 - sheltered(head)) * distanceFade * (1.0 - aTail * 0.9);
  gl_Position = projectionMatrix * viewMatrix * vec4(head + streak, 1.0);
}
`

const rainFragmentShader = `
uniform vec3 uColor;
uniform float uOpacity;
varying float vFade;
void main() {
  gl_FragColor = vec4(uColor, vFade * uOpacity);
  #include <colorspace_fragment>
}
`

const dustVertexShader = `
uniform float uTime;
uniform float uSize;
uniform float uPixelRatio;
attribute float aPhase;
varying float vTwinkle;
varying float vNear;
void main() {
  vec3 drift = vec3(
    sin(uTime * 0.13 + aPhase) * 0.32,
    sin(uTime * 0.07 + aPhase * 1.7) * 0.22,
    cos(uTime * 0.11 + aPhase * 0.6) * 0.32
  );
  vec4 viewPosition = modelViewMatrix * vec4(position + drift, 1.0);
  vTwinkle = 0.55 + 0.45 * sin(uTime * 0.9 + aPhase * 3.0);
  vNear = 1.0 - smoothstep(6.0, 18.0, -viewPosition.z);
  gl_PointSize = clamp(uSize * uPixelRatio * 260.0 / -viewPosition.z, 1.0, 7.0 * uPixelRatio);
  gl_Position = projectionMatrix * viewPosition;
}
`

const dustFragmentShader = `
uniform vec3 uColor;
uniform float uOpacity;
varying float vTwinkle;
varying float vNear;
void main() {
  float radius = length(gl_PointCoord - 0.5) * 2.0;
  float soft = 1.0 - smoothstep(0.2, 1.0, radius);
  gl_FragColor = vec4(uColor, soft * vTwinkle * vNear * uOpacity);
  #include <colorspace_fragment>
}
`

function createSkyMaterial(colors: SkyColors): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      uZenith: { value: colors.zenith },
      uSky: { value: colors.sky },
      uLow: { value: colors.low },
      uHorizon: { value: colors.horizon },
      uGlow: { value: colors.glow },
      uCityGlow: { value: colors.cityGlow },
      uRed: { value: new Color(palette.fusion) },
      uSunDirection: { value: [0.42, 0.05, -0.9] },
      uRedAmount: { value: 0 },
    },
    vertexShader: skyVertexShader,
    fragmentShader: skyFragmentShader,
    side: BackSide,
    depthWrite: false,
  })
}

function createEnvironmentMap(context: FloorContext, skyMaterial: ShaderMaterial): WebGLRenderTarget {
  const environmentScene = new Scene()
  const sky = new Mesh(new SphereGeometry(skyRadius, 32, 16), skyMaterial)
  const warm = new MeshBasicMaterial({ color: new Color(palette.warm).multiplyScalar(3) })
  const cool = new MeshBasicMaterial({ color: new Color('#8ea4ff').multiplyScalar(0.8) })
  const panels = [
    new Mesh(new BoxGeometry(4, 3, 0.2), warm),
    new Mesh(new BoxGeometry(1, 0.2, 1), warm),
    new Mesh(new BoxGeometry(14, 2, 0.2), cool),
  ]
  panels[0].position.set(0, 2, 20)
  panels[1].position.set(-12, 9, 6)
  panels[2].position.set(0, 4, -40)
  environmentScene.add(sky, ...panels)
  const generator = new PMREMGenerator(context.renderer)
  const target = generator.fromScene(environmentScene, 0.04, 0.1, skyRadius * 2)
  generator.dispose()
  disposeTree(environmentScene)
  return target
}

function skylineLayout(): { blocks: Matrix4[]; windows: Matrix4[]; windowColors: Color[] } {
  const random = createRandom(4711)
  const blocks: Matrix4[] = []
  const windows: Matrix4[] = []
  const windowColors: Color[] = []
  const warm = new Color(palette.warm)
  const cool = new Color('#9db3ff')
  const rows = [
    { z: [-62, -78], height: [8, 26], width: [8, 18], gap: [1, 4] },
    { z: [-86, -118], height: [14, 38], width: [10, 22], gap: [2, 6] },
  ] as const
  for (const row of rows) {
    let x = -84
    while (x < 84) {
      const width = row.width[0] + random() * (row.width[1] - row.width[0])
      const height = row.height[0] + random() * (row.height[1] - row.height[0])
      const depth = 8 + random() * 10
      const z = row.z[0] + random() * (row.z[1] - row.z[0])
      const centerX = x + width / 2
      const skipsLandmark = Math.abs(centerX - 32) < 18 && row.z[0] === -62
      if (!skipsLandmark) {
        blocks.push(composeMatrix([centerX, height / 2 - 0.2, z], [0, 0, 0], [width, height, depth]))
        const windowCount = Math.floor(3 + random() * 10)
        for (let window = 0; window < windowCount; window += 1) {
          const column = Math.floor(random() * Math.max(1, width / 2.4 - 1))
          const floor = Math.floor(random() * Math.max(1, height / 3.2 - 1))
          windows.push(composeMatrix([x + 1.6 + column * 2.4, 2.4 + floor * 3.2, z + depth / 2 + 0.05], [0, 0, 0], [1.1, 1.4, 1]))
          windowColors.push(random() < 0.78 ? warm.clone().multiplyScalar(0.6 + random() * 0.8) : cool.clone().multiplyScalar(0.5))
        }
      }
      x += width + row.gap[0] + random() * (row.gap[1] - row.gap[0])
    }
  }
  windows.push(composeMatrix([52, 93.6, -128], [0, 0, 0], [0.8, 0.8, 1]))
  windowColors.push(new Color(palette.fusion).multiplyScalar(2.2))
  windows.push(composeMatrix([52, 64.5, -121], [0, 0, 0], [0.6, 0.6, 1]))
  windowColors.push(new Color(palette.fusion).multiplyScalar(1.6))
  return { blocks, windows, windowColors }
}

function cathedralGeometry(): BufferGeometry[] {
  const pieces: BufferGeometry[] = []
  const center = [-70, 0, -140] as const
  const spireXs = [center[0] - 5.5, center[0] + 5.5]
  for (const x of spireXs) {
    pieces.push(block([8, 48, 8], [x, 24, center[2]]))
    pieces.push(block([6.4, 6, 6.4], [x, 51, center[2]]))
    pieces.push(place(new ConeGeometry(3.6, 30, 8), [x, 69, center[2]], [0, Math.PI / 8, 0]))
    for (const [offsetX, offsetZ] of [[-3.4, -3.4], [3.4, -3.4], [-3.4, 3.4], [3.4, 3.4]] as const) {
      pieces.push(place(new ConeGeometry(0.7, 7, 4), [x + offsetX, 51.5, center[2] + offsetZ]))
    }
  }
  pieces.push(blockBetween([center[0] - 1.5, 0, center[2] - 4], [center[0] + 1.5, 34, center[2] + 4]))
  pieces.push(blockBetween([center[0] + 9.5, 0, center[2] - 7], [center[0] + 46, 20, center[2] + 7]))
  pieces.push(place(new CylinderGeometry(0, 8.2, 9, 4, 1), [center[0] + 27.7, 24.5, center[2]], [0, Math.PI / 4, 0], [2.6, 1, 1]))
  pieces.push(blockBetween([center[0] + 24, 0, center[2] - 14], [center[0] + 31, 22, center[2] + 14]))
  pieces.push(place(new ConeGeometry(1.4, 16, 8), [center[0] + 27.5, 34, center[2]]))
  pieces.push(place(new CylinderGeometry(7, 7, 20, 16), [center[0] + 46, 10, center[2]]))
  pieces.push(place(new ConeGeometry(7.2, 8, 16), [center[0] + 46, 24, center[2]]))
  return pieces
}

function coloniusGeometry(): BufferGeometry[] {
  const base = [52, 0, -128] as const
  return [
    place(new CylinderGeometry(1.6, 2.6, 62, 16), [base[0], 31, base[2]]),
    place(new CylinderGeometry(7, 6, 3, 24), [base[0], 60, base[2]]),
    place(new CylinderGeometry(6, 7, 3, 24), [base[0], 63, base[2]]),
    place(new CylinderGeometry(1.2, 1.4, 12, 12), [base[0], 70.5, base[2]]),
    place(new CylinderGeometry(0.3, 0.45, 18, 8), [base[0], 85.5, base[2]]),
  ]
}

function craneHouseGeometry(): BufferGeometry[] {
  const pieces: BufferGeometry[] = []
  for (const x of [16, 33, 50]) {
    pieces.push(blockBetween([x, -0.2, -68], [x + 6, 31, -62]))
    pieces.push(blockBetween([x - 12, 24, -68], [x + 6, 31, -62]))
  }
  return pieces
}

function createRain(count: number): { lines: LineSegments; material: ShaderMaterial } {
  const random = createRandom(9001)
  const positions = new Float32Array(count * 6)
  const tails = new Float32Array(count * 2)
  const speeds = new Float32Array(count * 2)
  for (let drop = 0; drop < count; drop += 1) {
    const seed = [random(), random(), random()]
    const speed = 9 + random() * 4
    for (let end = 0; end < 2; end += 1) {
      const vertex = drop * 2 + end
      positions.set(seed, vertex * 3)
      tails[vertex] = end
      speeds[vertex] = speed
    }
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setAttribute('aTail', new Float32BufferAttribute(tails, 1))
  geometry.setAttribute('aSpeed', new Float32BufferAttribute(speeds, 1))
  const material = new ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uBox: { value: [...rainBox] },
      uWind: { value: [0.12, 0, 0.05] },
      uLength: { value: 0.55 },
      uColor: { value: new Color('#A9B8D6') },
      uOpacity: { value: 0 },
    },
    vertexShader: rainVertexShader,
    fragmentShader: rainFragmentShader,
    transparent: true,
    depthWrite: false,
  })
  const lines = new LineSegments(geometry, material)
  lines.frustumCulled = false
  lines.renderOrder = 2
  return { lines, material }
}

function createDust(count: number): { points: Points; material: ShaderMaterial } {
  const random = createRandom(31337)
  const positions = new Float32Array(count * 3)
  const phases = new Float32Array(count)
  for (let mote = 0; mote < count; mote += 1) {
    positions[mote * 3] = -6.7 + random() * 13.4
    positions[mote * 3 + 1] = 0.3 + random() * 27.2
    positions[mote * 3 + 2] = -6.7 + random() * 13.6
    phases[mote] = random() * Math.PI * 2
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setAttribute('aPhase', new Float32BufferAttribute(phases, 1))
  const material = new ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uSize: { value: 0.035 },
      uPixelRatio: { value: 1 },
      uColor: { value: new Color('#FFE2BC') },
      uOpacity: { value: 0.3 },
    },
    vertexShader: dustVertexShader,
    fragmentShader: dustFragmentShader,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  })
  const points = new Points(geometry, material)
  points.frustumCulled = false
  return { points, material }
}

export function createAtmosphere(context: FloorContext): FloorSet & { fog: FogExp2 } {
  const { scene, camera, quality, renderer } = context
  const root = new Group()
  root.name = 'atmosphere'
  const skyState = skyColorsOf(skyStops[0])
  const fog = new FogExp2(skyState.fog.clone(), fogDensityRange[0])

  const skyMaterial = createSkyMaterial(skyState)
  const sky = new Mesh(new SphereGeometry(skyRadius, 48, 24), skyMaterial)
  sky.frustumCulled = false
  sky.renderOrder = -10

  const previousEnvironment = scene.environment
  const environment = createEnvironmentMap(context, skyMaterial.clone())
  scene.environment = environment.texture

  const ground = new Mesh(
    place(new CircleGeometry(320, 48), [0, -0.2, 0], [-Math.PI / 2, 0, 0]),
    new MeshStandardMaterial({ color: '#0C0F14', roughness: 0.95, metalness: 0 }),
  )
  ground.receiveShadow = true
  const river = new Mesh(
    place(new PlaneGeometry(420, 14), [0, -0.17, -52], [-Math.PI / 2, 0, 0]),
    new MeshStandardMaterial({ color: '#04070C', roughness: 0.07, metalness: 0 }),
  )

  const silhouetteBase = new Color('#05070C')
  const silhouetteMaterial = new MeshBasicMaterial({ color: silhouetteBase.clone(), fog: false })
  const landmarkMaterial = new MeshBasicMaterial({ color: silhouetteBase.clone(), fog: false })
  const layout = skylineLayout()
  const skyline = instances(new BoxGeometry(1, 1, 1), silhouetteMaterial, layout.blocks)
  const landmarks = new Mesh(merge([...cathedralGeometry(), ...coloniusGeometry(), ...craneHouseGeometry()]), landmarkMaterial)
  const windowMaterial = new MeshBasicMaterial({ fog: false, transparent: true })
  const skylineWindows = instances(new PlaneGeometry(1, 1), windowMaterial, layout.windows, layout.windowColors)

  const rain = createRain(rainCapacity)
  const dust = createDust(dustCapacity)

  const moonColor = new Color('#A9BCFF')
  const dawnColor = new Color(palette.dawn)
  const redColor = new Color(palette.fusion)
  const key = new DirectionalLight(moonColor, 1.6)
  key.position.set(keyTarget[0] + keyOffset[0], keyTarget[1] + keyOffset[1], keyTarget[2] + keyOffset[2])
  key.target.position.set(...keyTarget)
  key.castShadow = quality.shadows > 0
  key.shadow.mapSize.set(Math.max(quality.shadows, 512), Math.max(quality.shadows, 512))
  key.shadow.camera.left = -25
  key.shadow.camera.right = 25
  key.shadow.camera.top = 27
  key.shadow.camera.bottom = -27
  key.shadow.camera.near = 30
  key.shadow.camera.far = 110
  key.shadow.camera.updateProjectionMatrix()
  key.shadow.bias = -0.0004
  key.shadow.normalBias = 0.03

  const skyColor = new Color(skyTint)
  const hemisphere = new HemisphereLight(skyColor, groundBounce, hemisphereStrength)

  const lanes = Array.from({ length: lightLaneCount }, (_, lane) => ({
    light: new PointLight(palette.warm, 0, 10, 2),
    ledger: lightLedger.filter((entry) => entry.lane === lane),
  }))
  const levels: Record<LightLevel, number> = { practical: 1, screen: 1, street: 1 }

  root.add(sky, ground, river, skyline, landmarks, skylineWindows, rain.lines, dust.points, key, key.target, hemisphere, ...lanes.map((lane) => lane.light))

  const cameraPosition = new Vector3()
  const fogRed = new Color('#2A0E0D')
  const afterBlueHour = (dawn: number) => smoothstep(0.35, 1, dawn)
  let frozenTime = 0

  function update(frame: FrameState): void {
    const { world, reducedMotion } = frame
    const time = reducedMotion ? frozenTime : frame.time % timeWrap
    frozenTime = time

    fog.density = fogDensityRange[0] + world.fog * (fogDensityRange[1] - fogDensityRange[0])
    sampleSky(world.dawn, skyState)
    fog.color.copy(skyState.fog).lerp(fogRed, world.red * 0.3)

    sky.position.copy(camera.getWorldPosition(cameraPosition))
    skyMaterial.uniforms.uRedAmount.value = world.red

    const haze = 0.08 + world.fog * 0.3 + world.dawn * 0.15
    silhouetteMaterial.color.copy(silhouetteBase).lerp(skyState.haze, haze)
    landmarkMaterial.color.copy(silhouetteBase).lerp(skyState.haze, Math.min(0.85, haze + 0.25))
    windowMaterial.color.setScalar((1 - world.fog * 0.55) * (1 - world.dawn * 0.7))
    windowMaterial.opacity = 1 - smoothstep(0.55, 0.9, world.dawn)
    skylineWindows.visible = windowMaterial.opacity > 0.01

    const rainActive = world.rain > 0.01
    rain.lines.visible = rainActive
    rain.material.uniforms.uTime.value = time
    rain.material.uniforms.uOpacity.value = world.rain * 0.5
    rain.lines.geometry.setDrawRange(0, Math.round(rainCapacity * quality.particles) * 2)

    dust.material.uniforms.uTime.value = time
    dust.material.uniforms.uPixelRatio.value = renderer.getPixelRatio()
    dust.material.uniforms.uOpacity.value = 0.12 + world.practicals * 0.28
    dust.points.geometry.setDrawRange(0, Math.round(dustCapacity * quality.particles))

    key.intensity = keyStrength * world.key
    key.color.copy(moonColor).lerp(dawnColor, afterBlueHour(world.dawn) * 0.7).lerp(redColor, world.red * 0.25)
    key.castShadow = quality.shadows > 0 && !frame.mobile
    hemisphere.intensity = hemisphereStrength * world.ambient
    hemisphere.color.copy(skyColor).lerp(dawnColor, afterBlueHour(world.dawn) * 0.5)
    scene.environmentIntensity = environmentStrength * world.ambient + world.dawn * 0.2

    levels.practical = 0.25 + 0.75 * world.practicals
    levels.screen = 0.7 + 0.3 * world.practicals
    levels.street = 1 - world.dawn * 0.45
    for (const lane of lanes) {
      let active: LedgerLight | undefined
      let weight = 0
      for (const entry of lane.ledger) {
        const entryWeight = lightWeight(entry.window, frame.progress.smooth)
        if (entryWeight > weight) {
          weight = entryWeight
          active = entry
        }
      }
      if (!active) {
        lane.light.intensity = 0
        continue
      }
      lane.light.position.set(...active.position)
      lane.light.color.set(active.color)
      lane.light.distance = active.distance
      const breath = reducedMotion ? 1 : breathing(active.breath, frame.time)
      lane.light.intensity = active.intensity * weight * levels[active.level] * breath
    }
  }

  function dispose(): void {
    disposeTree(root)
    environment.dispose()
    if (scene.environment === environment.texture) scene.environment = previousEnvironment
  }

  return { id: 'street', root, proxies: [], update, dispose, fog }
}
