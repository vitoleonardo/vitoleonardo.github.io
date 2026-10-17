import {
  Color,
  MeshStandardMaterial,
  Vector3,
  Vector4,
  type ColorRepresentation,
  type IUniform,
  type MeshStandardMaterialParameters,
  type WebGLProgramParametersWithUniforms,
  type WebGLRenderer,
} from 'three'
import type { FrameState, Vec3 } from '../types'
import { patchSurface } from './kit'

export const calmLight = {
  minPeriodSeconds: 3.5,
  maxSwing: 0.2,
} as const

const maxBreathAmplitude = calmLight.maxSwing / (2 - calmLight.maxSwing)

export function breathe(time: number, periodSeconds: number, amplitude: number, phase = 0): number {
  const period = Math.max(periodSeconds, calmLight.minPeriodSeconds)
  const depth = Math.min(Math.abs(amplitude), maxBreathAmplitude)
  return 1 + depth * Math.sin((time / period + phase) * Math.PI * 2)
}

export function withinChapters(progress: number, from: number, to: number): boolean {
  return progress >= from && progress <= to
}

export type SceneClock = (frame: FrameState) => number

export function createSceneClock(): SceneClock {
  let frozen = 0
  return (frame) => {
    if (!frame.reducedMotion) frozen = frame.time
    return frozen
  }
}

export interface AreaEmitter {
  readonly radiance: Color
  readonly uniforms: {
    uAreaCorners: IUniform<Vector3[]>
    uAreaRadiance: IUniform<Color>
  }
}

export interface AreaRectangle {
  centre: Vec3
  width: number
  height: number
  yaw: number
}

export function createAreaEmitter(rectangle: AreaRectangle): AreaEmitter {
  const [x, y, z] = rectangle.centre
  const tangent = new Vector3(Math.cos(rectangle.yaw), 0, -Math.sin(rectangle.yaw)).multiplyScalar(rectangle.width / 2)
  const up = new Vector3(0, rectangle.height / 2, 0)
  const centre = new Vector3(x, y, z)
  const corners = [
    centre.clone().sub(tangent).sub(up),
    centre.clone().sub(tangent).add(up),
    centre.clone().add(tangent).add(up),
    centre.clone().add(tangent).sub(up),
  ]
  const radiance = new Color(0, 0, 0)
  return { radiance, uniforms: { uAreaCorners: { value: corners }, uAreaRadiance: { value: radiance } } }
}

const areaVaryings = `
varying vec3 vAreaPosition;
varying vec3 vAreaNormal;
`

const areaVertex = `
vec4 areaPosition = vec4( transformed, 1.0 );
vec3 areaNormal = objectNormal;
#ifdef USE_INSTANCING
  areaPosition = instanceMatrix * areaPosition;
  areaNormal = mat3( instanceMatrix ) * areaNormal;
#endif
vAreaPosition = ( modelMatrix * areaPosition ).xyz;
vAreaNormal = normalize( mat3( modelMatrix ) * areaNormal );
`

const areaFragmentHeader = `
uniform vec3 uAreaCorners[ 4 ];
uniform vec3 uAreaRadiance;
float areaEdge( vec3 from, vec3 to, vec3 receiver ) {
  float angle = acos( clamp( dot( from, to ), -0.9999, 0.9999 ) );
  vec3 axis = cross( from, to );
  float axisLength = length( axis );
  return axisLength < 1e-6 ? 0.0 : angle * dot( axis / axisLength, receiver );
}
float areaFormFactor( vec3 position, vec3 receiver ) {
  vec3 a = normalize( uAreaCorners[ 0 ] - position );
  vec3 b = normalize( uAreaCorners[ 1 ] - position );
  vec3 c = normalize( uAreaCorners[ 2 ] - position );
  vec3 d = normalize( uAreaCorners[ 3 ] - position );
  float sum = areaEdge( a, b, receiver ) + areaEdge( b, c, receiver ) + areaEdge( c, d, receiver ) + areaEdge( d, a, receiver );
  return max( sum * 0.15915494, 0.0 );
}
`

const areaContribution = `
float areaReceived = areaFormFactor( vAreaPosition, normalize( vAreaNormal ) );
reflectedLight.directDiffuse += ( material.diffuseContribution + material.specularColorBlended * ( 0.25 + 0.5 * material.roughness ) ) * uAreaRadiance * areaReceived;
`

export function litByArea<T extends MeshStandardMaterial>(material: T, emitter: AreaEmitter): T {
  const previousCompile = material.onBeforeCompile.bind(material)
  const previousKey = material.customProgramCacheKey()
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms, renderer: WebGLRenderer) => {
    previousCompile(shader, renderer)
    Object.assign(shader.uniforms, emitter.uniforms)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${areaVaryings}`)
      .replace('#include <project_vertex>', `#include <project_vertex>\n${areaVertex}`)
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${areaVaryings}${areaFragmentHeader}`)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>\n${areaContribution}`)
  }
  material.customProgramCacheKey = () => `${previousKey}|area-lit`
  return material
}

export interface PaintWear {
  paint: ColorRepresentation
  cellsPerMetre: number
  chipShare: number
  groundY: number
  grimeHeight: number
  scorch?: { centre: Vec3; radius: number; strength: number }
}

const paintWearHeader = `
uniform vec4 uPaintWear;
uniform vec4 uPaintScorch;
uniform float uPaintScorchStrength;
`

const paintWearAlbedo = `
  float paintField = surfaceFbm( vSurfacePosition * uPaintWear.x );
  float paintFine = surfaceNoise( vSurfacePosition * uPaintWear.x * 7.0 );
  float paintUp = smoothstep( 0.5, 0.9, vSurfaceNormal.y );
  float paintHeight = vSurfacePosition.y - uPaintWear.z;
  float paintGrime = 1.0 - smoothstep( 0.0, uPaintWear.w, paintHeight + ( paintField - 0.5 ) * 0.5 );
  float paintChipNoise = paintField * 0.65 + paintFine * 0.35 + paintGrime * 0.2 + paintUp * 0.08;
  float paintChip = smoothstep( 1.0 - uPaintWear.y, 1.04 - uPaintWear.y, paintChipNoise );
  float paintStreakNoise = surfaceNoise( vec3( vSurfacePosition.x * 11.0, vSurfacePosition.y * 0.7, vSurfacePosition.z * 11.0 ) );
  float paintStreak = ( 1.0 - paintUp ) * smoothstep( 0.6, 0.92, paintStreakNoise );
  float paintScorchReach = length( vSurfacePosition - uPaintScorch.xyz ) / max( uPaintScorch.w, 1e-3 );
  float paintScorch = ( 1.0 - smoothstep( 0.35, 1.0, paintScorchReach + ( paintField - 0.5 ) * 0.45 ) ) * uPaintScorchStrength;
  diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.13, 0.12, 0.115 ), paintChip );
  diffuseColor.rgb *= mix( 1.0, 0.62, paintGrime * ( 0.45 + 0.55 * paintField ) );
  diffuseColor.rgb *= 1.0 - paintStreak * 0.22;
  diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.02, 0.018, 0.017 ), paintScorch * 0.9 );
`

const paintWearRoughness = `
  roughnessFactor = mix( roughnessFactor, 0.34, paintChip );
  roughnessFactor = mix( roughnessFactor, 0.82, max( paintGrime * 0.45, paintScorch ) );
  roughnessFactor = clamp( roughnessFactor + ( paintFine - 0.5 ) * 0.08, 0.05, 1.0 );
`

export function paintedSteelMaterial(wear: PaintWear, parameters: MeshStandardMaterialParameters = {}): MeshStandardMaterial {
  const scorch = wear.scorch ?? { centre: [0, 0, 0] as Vec3, radius: 1, strength: 0 }
  return patchSurface(
    new MeshStandardMaterial({ color: wear.paint, metalness: 0.15, roughness: 0.52, ...parameters }),
    {
      key: 'painted-steel',
      uniforms: {
        uPaintWear: { value: new Vector4(wear.cellsPerMetre, wear.chipShare, wear.groundY, wear.grimeHeight) },
        uPaintScorch: { value: new Vector4(...scorch.centre, scorch.radius) },
        uPaintScorchStrength: { value: scorch.strength },
      },
      fragmentHeader: paintWearHeader,
      albedo: paintWearAlbedo,
      roughness: paintWearRoughness,
    },
  )
}
