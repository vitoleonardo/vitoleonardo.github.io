import { AdditiveBlending, CanvasTexture, Color, Mesh, PlaneGeometry, RepeatWrapping, ShaderMaterial, type Texture } from 'three'
import { merge, place } from '../geometry'
import { palette, towerSpec } from '../floors/kit'
import type { FrameState } from '../types'

const street = { halfWidth: 40, kerbZ: 11, farZ: 60, roadY: -0.14, lift: 0.006 } as const
const facadeFront = towerSpec.halfSize + 0.15
const facadeSide = towerSpec.halfSize + towerSpec.wallThickness
const litFloors = 7
const puddleSize = 256

export interface FacadeRhythm {
  stripePeriod: number
  stripeWidth: number
}

export const spillRhythm: Readonly<Record<'mullions' | 'fins' | 'diagrid' | 'terraces', FacadeRhythm>> = {
  mullions: { stripePeriod: 2, stripeWidth: 0.09 },
  fins: { stripePeriod: 1, stripeWidth: 0.22 },
  diagrid: { stripePeriod: 3.7, stripeWidth: 0.16 },
  terraces: { stripePeriod: 2, stripeWidth: 0.06 },
}

const vertexShader = `
varying vec3 vWorld;
void main() {
  vec4 world = modelMatrix * vec4( position, 1.0 );
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`

const fragmentShader = `
uniform vec3 uWarm;
uniform float uFloorsLit;
uniform float uInterior;
uniform float uDaylight;
uniform float uFogDensity;
uniform vec2 uRhythm;
uniform sampler2D uPuddles;
varying vec3 vWorld;

const float storey = ${towerSpec.floorHeight.toFixed(1)};
const float frontZ = ${facadeFront.toFixed(2)};
const float sideX = ${facadeSide.toFixed(2)};
const float halfSpan = ${towerSpec.halfSize.toFixed(1)};

float floorGlow( float y ) {
  float level = floor( y / storey );
  float inFloor = smoothstep( 0.1, 0.6, y - level * storey ) * ( 1.0 - smoothstep( storey - 0.75, storey - 0.4, y - level * storey ) );
  float lit = smoothstep( 0.0, 1.0, uFloorsLit - level );
  float groundFloor = 1.0 - smoothstep( 0.5, 1.5, level );
  return inFloor * lit * ( 0.55 + 0.45 * groundFloor ) * step( 0.0, y ) * step( level, ${(litFloors - 1).toFixed(1)} );
}

float stripes( float along, float softness ) {
  float cell = abs( fract( along / uRhythm.x ) - 0.5 ) * uRhythm.x;
  float gap = uRhythm.y * 0.5 + softness;
  return smoothstep( gap * 0.4, gap, cell );
}

float facadeHit( vec3 origin, vec3 direction, float planeZ, float minX, float maxX, float blur, out float travel ) {
  travel = ( planeZ - origin.z ) / direction.z;
  if ( direction.z >= -1e-4 || travel < 0.0 ) return 0.0;
  vec3 hit = origin + direction * travel;
  float softness = blur * travel * 0.3;
  float inside = smoothstep( minX - softness, minX + softness, hit.x ) * ( 1.0 - smoothstep( maxX - softness, maxX + softness, hit.x ) );
  return inside * floorGlow( hit.y ) * mix( 1.0, stripes( hit.x + halfSpan, softness ), 0.8 );
}

float sideHit( vec3 origin, vec3 direction, float planeX, float blur, out float travel ) {
  float towards = sign( planeX - origin.x );
  travel = ( planeX - origin.x ) / direction.x;
  if ( direction.x * towards <= 1e-4 || travel < 0.0 ) return 0.0;
  vec3 hit = origin + direction * travel;
  float softness = blur * travel;
  float inside = smoothstep( -halfSpan - softness, -halfSpan + softness, hit.z ) * ( 1.0 - smoothstep( halfSpan - softness, halfSpan + softness, hit.z ) );
  float window = smoothstep( 0.0, 0.4, abs( fract( ( hit.z + halfSpan ) / 4.0 ) - 0.5 ) * 4.0 - 0.6 );
  return inside * floorGlow( hit.y ) * 0.3 * window;
}

void main() {
  vec3 view = normalize( vWorld - cameraPosition );
  vec3 mirrored = reflect( view, vec3( 0.0, 1.0, 0.0 ) );
  vec2 puddleUv = vWorld.xz / 23.0;
  float puddle = texture2D( uPuddles, puddleUv ).r;
  float standing = smoothstep( 0.45, 0.78, puddle );
  float sheen = 0.12 + 0.88 * standing;
  float blur = mix( 0.09, 0.025, standing );

  float travel;
  float glow = facadeHit( vWorld, mirrored, frontZ, -halfSpan, halfSpan, blur, travel );
  float reach = 1.0 - 0.6 * smoothstep( 12.0, 45.0, travel );
  glow *= reach;
  float sideTravel;
  float sideGlow = sideHit( vWorld, mirrored, sideX, blur, sideTravel ) + sideHit( vWorld, mirrored, -sideX, blur, sideTravel );
  glow += sideGlow * ( 1.0 - 0.6 * smoothstep( 12.0, 45.0, sideTravel ) );

  float fresnel = 0.2 + 0.8 * pow( 1.0 - abs( view.y ), 3.0 );
  vec3 reflection = uWarm * glow * fresnel * sheen * 0.55;

  float carpetDepth = vWorld.z - frontZ;
  float carpet = exp( -carpetDepth / 2.6 ) * step( 0.0, carpetDepth );
  carpet *= smoothstep( -halfSpan - 1.5, -halfSpan + 1.0, vWorld.x ) * ( 1.0 - smoothstep( halfSpan - 1.0, halfSpan + 1.5, vWorld.x ) );
  carpet *= mix( 1.0, stripes( vWorld.x + halfSpan, 0.05 + carpetDepth * 0.12 ), 0.5 );
  carpet *= smoothstep( 0.0, 1.0, uFloorsLit ) * ( 0.35 + 0.65 * uInterior );
  vec3 spill = uWarm * carpet * 0.07 * ( 0.7 + 0.3 * puddle );

  float depth = distance( vWorld, cameraPosition );
  float fogged = exp( - uFogDensity * uFogDensity * depth * depth );
  gl_FragColor = vec4( ( reflection + spill ) * fogged * uDaylight, 1.0 );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

function createPuddleTexture(): CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = puddleSize
  canvas.height = puddleSize
  const context = canvas.getContext('2d')
  if (!context) throw new Error('2D canvas unavailable for the puddle texture')
  const image = context.createImageData(puddleSize, puddleSize)
  let seed = 1234567
  const random = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296
    return seed / 4294967296
  }
  const cells = 8
  const grid = Array.from({ length: (cells + 1) * (cells + 1) }, () => random())
  const sample = (u: number, v: number) => {
    const x = u * cells
    const y = v * cells
    const x0 = Math.floor(x) % cells
    const y0 = Math.floor(y) % cells
    const tx = x - Math.floor(x)
    const ty = y - Math.floor(y)
    const sx = tx * tx * (3 - 2 * tx)
    const sy = ty * ty * (3 - 2 * ty)
    const at = (gx: number, gy: number) => grid[(gy % cells) * (cells + 1) + (gx % cells)]
    const top = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * sx
    const bottom = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * sx
    return top + (bottom - top) * sy
  }
  for (let y = 0; y < puddleSize; y += 1) {
    for (let x = 0; x < puddleSize; x += 1) {
      const u = x / puddleSize
      const v = y / puddleSize
      const value = sample(u, v) * 0.6 + sample((u * 3) % 1, (v * 3) % 1) * 0.3 + sample((u * 9) % 1, (v * 9) % 1) * 0.1
      const index = (y * puddleSize + x) * 4
      const byte = Math.round(Math.min(1, Math.max(0, value)) * 255)
      image.data[index] = byte
      image.data[index + 1] = byte
      image.data[index + 2] = byte
      image.data[index + 3] = 255
    }
  }
  context.putImageData(image, 0, 0)
  const texture = new CanvasTexture(canvas)
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping
  return texture
}

function spillGeometry() {
  const roadDepth = street.farZ - street.kerbZ - 0.25
  const pavementDepth = street.kerbZ - facadeFront
  return merge([
    place(new PlaneGeometry(street.halfWidth * 2, roadDepth), [0, street.roadY + street.lift, street.kerbZ + 0.25 + roadDepth / 2], [-Math.PI / 2, 0, 0]),
    place(new PlaneGeometry(street.halfWidth * 2, pavementDepth), [0, street.lift, facadeFront + pavementDepth / 2], [-Math.PI / 2, 0, 0]),
  ])
}

export interface WindowSpill {
  mesh: Mesh
  textures: readonly Texture[]
  update(frame: FrameState, fogDensity: number, interior: number): void
}

export function createWindowSpill(rhythm: FacadeRhythm): WindowSpill {
  const puddles = createPuddleTexture()
  const tint = new Color(palette.warm)
  const material = new ShaderMaterial({
    uniforms: {
      uWarm: { value: tint },
      uFloorsLit: { value: 1 },
      uInterior: { value: 0 },
      uDaylight: { value: 1 },
      uFogDensity: { value: 0 },
      uRhythm: { value: [rhythm.stripePeriod, rhythm.stripeWidth] },
      uPuddles: { value: puddles },
    },
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    polygonOffset: true,
    polygonOffsetFactor: -5,
  })
  const mesh = new Mesh(spillGeometry(), material)
  mesh.renderOrder = 1
  mesh.name = 'window-spill'
  const warm = new Color(palette.warm)
  const dawn = new Color(palette.dawn)
  return {
    mesh,
    textures: [puddles],
    update(frame, fogDensity, interior) {
      const { world } = frame
      material.uniforms.uFloorsLit.value = world.floorsLit
      material.uniforms.uInterior.value = interior
      material.uniforms.uDaylight.value = (1 - world.dawn * 0.7) * (0.75 + 0.25 * world.practicals)
      material.uniforms.uFogDensity.value = fogDensity
      tint.copy(warm).lerp(dawn, world.dawn * 0.5)
    },
  }
}
