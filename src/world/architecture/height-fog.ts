import { ShaderChunk } from 'three'

export const heightFog = {
  groundBoost: 1.1,
  scaleHeight: 7.5,
  lowTint: [1.12, 1.0, 0.86],
} as const

const marker = 'vFogHeight'

const parsVertex = `
#ifdef USE_FOG
  varying float vFogDepth;
  varying float ${marker};
#endif
`

const vertex = `
#ifdef USE_FOG
  vFogDepth = - mvPosition.z;
  ${marker} = dot( viewMatrix[ 1 ].xyz, mvPosition.xyz ) + cameraPosition.y;
#endif
`

const parsFragment = `
#ifdef USE_FOG
  uniform vec3 fogColor;
  varying float vFogDepth;
  varying float ${marker};
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif
  float fogHeightLayer( float fromY, float toY ) {
    float scale = ${heightFog.scaleHeight.toFixed(2)};
    float lower = max( min( fromY, toY ), 0.0 );
    float upper = max( max( fromY, toY ), 0.0 );
    float span = upper - lower;
    float thin = exp( - lower / scale );
    float thick = exp( - upper / scale );
    return span < 0.05 ? thin : ( thin - thick ) * scale / span;
  }
#endif
`

const fragment = `
#ifdef USE_FOG
  float fogLayer = fogHeightLayer( cameraPosition.y, ${marker} );
  float fogLift = 1.0 + ${heightFog.groundBoost.toFixed(2)} * fogLayer;
  #ifdef FOG_EXP2
    float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth * fogLift );
  #else
    float fogFactor = smoothstep( fogNear, fogFar / fogLift, vFogDepth );
  #endif
  vec3 fogLayerColor = fogColor * mix( vec3( 1.0 ), vec3( ${heightFog.lowTint.map((channel) => channel.toFixed(2)).join(', ')} ), fogLayer );
  gl_FragColor.rgb = mix( gl_FragColor.rgb, fogLayerColor, fogFactor );
#endif
`

export function installHeightFog(): void {
  if (ShaderChunk.fog_fragment.includes(marker)) return
  ShaderChunk.fog_pars_vertex = parsVertex
  ShaderChunk.fog_vertex = vertex
  ShaderChunk.fog_pars_fragment = parsFragment
  ShaderChunk.fog_fragment = fragment
}
