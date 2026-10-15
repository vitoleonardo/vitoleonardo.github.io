import { Color, MeshPhysicalMaterial, type MeshPhysicalMaterialParameters, type Texture } from 'three'
import { tokens } from '../tokens'

export const NIGHT_EMISSIVE_MAX = 1.2
const ENVIRONMENT_INTENSITY = 0.48
const DAY_SELF_GLOW = 0.07
const BASE_SPECULAR = 0.7
const NIGHT_ENVIRONMENT_FLOOR = 0.25
const RIPPLE_SPEED = 2.6

export interface PathUniforms {
  uTime: { value: number }
  uRippleAmp: { value: number }
  uRippleK: { value: number }
  uRippleSpeed: { value: number }
  uInkColour: { value: Color }
  uInkStart: { value: number }
  uInkEnd: { value: number }
  uInkEdge: { value: number }
}

export interface PathMaterials {
  tube: MeshPhysicalMaterial
  solid: MeshPhysicalMaterial
  uniforms: PathUniforms
  readonly blue: Color
  readonly red: Color
  setEmissive(intensity: number): void
  setNightLighting(night: number): void
  setEnvironment(environment: Texture): void
  glossy(colour: string, overrides?: MeshPhysicalMaterialParameters): MeshPhysicalMaterial
  dispose(): void
}

function createBaseMaterial(colour: Color, environment: Texture | null): MeshPhysicalMaterial {
  return new MeshPhysicalMaterial({
    color: colour.clone(),
    roughness: 0.25,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.1,
    envMap: environment,
    envMapIntensity: ENVIRONMENT_INTENSITY,
    emissive: colour.clone(),
    emissiveIntensity: 0,
    specularIntensity: BASE_SPECULAR,
  })
}

const VERTEX_HEAD = `
attribute vec2 aArc;
attribute vec2 aSide;
uniform float uTime;
uniform float uRippleAmp;
uniform float uRippleK;
uniform float uRippleSpeed;
varying float vArc01;
`

const VERTEX_BODY = `
transformed.xy += aSide * (uRippleAmp * sin(aArc.x * uRippleK - uTime * uRippleSpeed));
vArc01 = aArc.y;
`

const FRAGMENT_HEAD = `
uniform vec3 uInkColour;
uniform float uInkStart;
uniform float uInkEnd;
uniform float uInkEdge;
varying float vArc01;
`

const FRAGMENT_INK = `
float inkAmount = smoothstep(uInkStart - uInkEdge, uInkStart + uInkEdge, vArc01) * (1.0 - smoothstep(uInkEnd - uInkEdge, uInkEnd + uInkEdge, vArc01));
diffuseColor.rgb = mix(diffuseColor.rgb, uInkColour, inkAmount);
`

export function createPathMaterials(environment: Texture | null): PathMaterials {
  const blue = new Color(tokens.colour.blue)
  const red = new Color(tokens.colour.red)
  const uniforms: PathUniforms = {
    uTime: { value: 0 },
    uRippleAmp: { value: 0 },
    uRippleK: { value: 0.02 },
    uRippleSpeed: { value: RIPPLE_SPEED },
    uInkColour: { value: red.clone() },
    uInkStart: { value: -1 },
    uInkEnd: { value: -1 },
    uInkEdge: { value: 0.01 },
  }

  const tube = createBaseMaterial(blue, environment)
  tube.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `${VERTEX_HEAD}\n#include <common>`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${VERTEX_BODY}`)
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `${FRAGMENT_HEAD}\n#include <common>`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${FRAGMENT_INK}`)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= 1.0 - inkAmount;')
  }
  tube.customProgramCacheKey = () => 'path-tube-ripple-ink-v3'

  const solid = createBaseMaterial(blue, environment)
  const extra: MeshPhysicalMaterial[] = []

  return {
    tube,
    solid,
    uniforms,
    blue,
    red,
    setEmissive(intensity: number) {
      tube.emissiveIntensity = DAY_SELF_GLOW + intensity
      solid.emissiveIntensity = DAY_SELF_GLOW + intensity
    },
    setNightLighting(night: number) {
      const intensity = ENVIRONMENT_INTENSITY * (1 - (1 - NIGHT_ENVIRONMENT_FLOOR) * Math.min(1, Math.max(0, night)))
      tube.envMapIntensity = intensity
      solid.envMapIntensity = intensity
    },
    setEnvironment(next: Texture) {
      tube.envMap = next
      solid.envMap = next
      extra.forEach((material) => {
        material.envMap = next
      })
    },
    glossy(colour: string, overrides: MeshPhysicalMaterialParameters = {}) {
      const material = createBaseMaterial(new Color(colour), tube.envMap)
      material.emissiveIntensity = 0
      material.setValues(overrides)
      extra.push(material)
      return material
    },
    dispose() {
      tube.dispose()
      solid.dispose()
      extra.forEach((material) => material.dispose())
    },
  }
}
