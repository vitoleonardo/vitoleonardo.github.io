import { BoxGeometry, Color, CylinderGeometry, Group, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, TorusGeometry, Vector4, type BufferGeometry } from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { block, blockBetween, composeMatrix, createRandom, cylinderBetween, instances, merge, place, tintVertices } from '../geometry'
import { createLabelAtlas, createRackFaceTexture, labelRowUVs, rackFaceColumns } from '../textures'
import type { FloorFactory, FrameState } from '../types'
import { chapterIndex, createEmitter, disposeTree, floorBase, glassMaterial, nearChapter, palette, patchSurface, steelMaterial, towerSpec } from './kit'

interface RackRow {
  label: 'API' | 'Services' | 'Events' | 'Data'
  x: number
  color: string
  facing: 1 | -1
}

const rows: readonly RackRow[] = [
  { label: 'API', x: -2.8, color: palette.signal, facing: 1 },
  { label: 'Services', x: 0.2, color: palette.readable, facing: -1 },
  { label: 'Events', x: 3.2, color: palette.warm, facing: 1 },
  { label: 'Data', x: 6, color: palette.signal, facing: -1 },
]
const half = towerSpec.halfSize
const ceiling = towerSpec.floorHeight - towerSpec.slabThickness
const raisedFloor = 0.3
const tileSize = 0.6
const floorWestEdge = -4
const racksPerRow = 16
const rackPitch = 0.65
const rackWidth = 0.63
const rackDepth = 1
const rackHeight = 2.2
const rackTop = raisedFloor + rackHeight
const rowStartZ = -6.2
const rowEndZ = rowStartZ + racksPerRow * rackPitch
const rowLength = rowEndZ - rowStartZ
const coldAisles = [-1.3, 4.6] as const
const aisleCentres = [-1.3, 1.7, 4.6] as const
const trayBottom = rackTop + 0.14
const pipeY = 3.18
const pipeStartZ = -6.9
const pipeEndZ = 6.2
const pipeRadius = 0.11
const hangerSpacing = 1.6
const packetsPerPipe = 6
const luminaire = { y: ceiling - 0.28, startZ: -5.6, endZ: 3.6 } as const
const ledsPerFront = 6
const ledsPerRear = 2
const ledBlinkLimit = 0.9

interface Led {
  row: number
  frequency: number
  phase: number
  duty: number
  steady: boolean
}

interface Packet {
  row: number
  offset: number
  speed: number
}

function rackMatrices(): Matrix4[] {
  const matrices: Matrix4[] = []
  for (const row of rows) {
    for (let rack = 0; rack < racksPerRow; rack += 1) {
      matrices.push(composeMatrix([row.x, raisedFloor, rowStartZ + rackPitch * (rack + 0.5)], [0, row.facing > 0 ? 0 : Math.PI, 0]))
    }
  }
  return matrices
}

function rackFrameGeometry(): BufferGeometry {
  const halfDepth = rackDepth / 2
  const halfWidth = rackWidth / 2
  const pieces: BufferGeometry[] = [
    blockBetween([-halfDepth + 0.03, 0.06, -halfWidth + 0.005], [halfDepth - 0.03, rackHeight - 0.04, halfWidth - 0.005]),
    blockBetween([-halfDepth + 0.04, 0, -halfWidth + 0.02], [halfDepth - 0.04, 0.06, halfWidth - 0.02]),
    blockBetween([-halfDepth, rackHeight - 0.04, -halfWidth], [halfDepth, rackHeight, halfWidth]),
    blockBetween([-0.38, rackHeight, -0.07], [-0.14, rackHeight + 0.012, 0.07]),
  ]
  for (const side of [-1, 1]) {
    const outer = side * halfDepth
    const inner = side * (halfDepth - 0.03)
    const [minX, maxX] = side > 0 ? [inner, outer] : [outer, inner]
    pieces.push(blockBetween([minX, 0.06, -halfWidth], [maxX, rackHeight - 0.04, -halfWidth + 0.035]))
    pieces.push(blockBetween([minX, 0.06, halfWidth - 0.035], [maxX, rackHeight - 0.04, halfWidth]))
    pieces.push(blockBetween([minX, rackHeight - 0.1, -halfWidth], [maxX, rackHeight - 0.04, halfWidth]))
    pieces.push(blockBetween([minX, 0.06, -halfWidth], [maxX, 0.12, halfWidth]))
  }
  pieces.push(block([0.02, 0.22, 0.026], [halfDepth + 0.01, 1.15, halfWidth - 0.06]))
  return merge(pieces)
}

function rackFaceGeometry(): BufferGeometry {
  const faceWidth = rackWidth - 0.07
  const faceHeight = rackHeight - 0.22
  const column = 1 / rackFaceColumns
  const front = place(new PlaneGeometry(faceWidth, faceHeight), [rackDepth / 2 - 0.02, 0.12 + faceHeight / 2, 0], [0, Math.PI / 2, 0])
  const rear = place(new PlaneGeometry(faceWidth, faceHeight), [-rackDepth / 2 + 0.02, 0.12 + faceHeight / 2, 0], [0, -Math.PI / 2, 0])
  remapU(front, 0.004, column - 0.004)
  remapU(rear, column * (rackFaceColumns - 1) + 0.004, 1 - 0.004)
  return merge([front, rear])
}

function remapU(geometry: BufferGeometry, from: number, to: number): void {
  const uv = geometry.getAttribute('uv')
  for (let index = 0; index < uv.count; index += 1) uv.setX(index, from + uv.getX(index) * (to - from))
}

function rackGeometry(): BufferGeometry {
  const merged = mergeGeometries([rackFrameGeometry(), rackFaceGeometry()], true)
  if (!merged) throw new Error('Rack parts must share one attribute layout')
  return merged
}

function rackFaceMaterial(): MeshStandardMaterial {
  const material = new MeshStandardMaterial({ map: createRackFaceTexture(), roughness: 0.52, metalness: 0.3 })
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      '#include <uv_vertex>',
      `#include <uv_vertex>
      #if defined( USE_MAP ) && defined( USE_INSTANCING )
        float rackVariant = fract( sin( dot( instanceMatrix[ 3 ].xz, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 );
        if ( vMapUv.x < ${(1 / rackFaceColumns).toFixed(4)} ) vMapUv.x += floor( rackVariant * ${(rackFaceColumns - 1).toFixed(1)} ) * ${(1 / rackFaceColumns).toFixed(4)};
      #endif`,
    )
  }
  material.customProgramCacheKey = () => 'rack-face'
  return material
}

function raisedFloorMaterial(): MeshStandardMaterial {
  return patchSurface(new MeshStandardMaterial({ color: '#8C9198', roughness: 0.42, metalness: 0 }), {
    key: 'raised-floor',
    uniforms: {
      uTileAisles: { value: new Vector4(coldAisles[0], coldAisles[1], 0.35, rowStartZ) },
      uTileSpan: { value: rowEndZ },
    },
    fragmentHeader: 'uniform vec4 uTileAisles;\nuniform float uTileSpan;\n',
    albedo: `
      vec2 tilePosition = vSurfacePosition.xz / ${tileSize.toFixed(2)};
      vec2 tileCell = floor( tilePosition );
      vec2 tileLocal = fract( tilePosition );
      vec2 tileEdge = min( tileLocal, 1.0 - tileLocal ) * ${tileSize.toFixed(2)};
      float edgeDistance = min( tileEdge.x, tileEdge.y );
      float pixel = max( fwidth( vSurfacePosition.x ), fwidth( vSurfacePosition.z ) );
      float topFacing = step( 0.5, vSurfaceNormal.y );
      float seam = topFacing * ( 1.0 - smoothstep( 0.0015, 0.0015 + pixel * 1.5, edgeDistance ) );
      float lip = topFacing * ( 1.0 - smoothstep( 0.006, 0.014 + pixel, edgeDistance ) ) * ( 1.0 - seam );
      float tileCentreX = ( tileCell.x + 0.5 ) * ${tileSize.toFixed(2)};
      float aisleOffset = min( abs( tileCentreX - uTileAisles.x ), abs( tileCentreX - uTileAisles.y ) );
      float perforated = topFacing * step( aisleOffset, uTileAisles.z ) * step( uTileAisles.w, vSurfacePosition.z ) * step( vSurfacePosition.z, uTileSpan );
      vec2 holeLocal = fract( vSurfacePosition.xz / 0.045 ) - 0.5;
      float holePixel = pixel / 0.045;
      float hole = 1.0 - smoothstep( 0.27 - holePixel, 0.27 + holePixel, length( holeLocal ) );
      float holeVisible = 1.0 - smoothstep( 0.22, 0.55, holePixel );
      float vents = perforated * hole * holeVisible * step( 0.035, edgeDistance );
      float tileTone = 0.9 + 0.18 * fract( sin( dot( tileCell, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 );
      diffuseColor.rgb *= mix( 1.0, tileTone, topFacing ) * ( 1.0 - 0.8 * seam ) * ( 1.0 + 0.1 * lip );
      diffuseColor.rgb *= mix( 1.0, 0.16, vents ) * mix( 1.0, 0.72, perforated * ( 1.0 - holeVisible ) );
    `,
    roughness: `
      roughnessFactor = mix( roughnessFactor, 0.9, seam );
      roughnessFactor = mix( roughnessFactor, 0.75, max( vents, perforated * 0.4 ) );
    `,
  })
}

function raisedFloorGeometry(): BufferGeometry {
  return blockBetween([floorWestEdge, raisedFloor - 0.04, -half], [half, raisedFloor, half])
}

function pedestalGeometry(): BufferGeometry[] {
  const pieces: BufferGeometry[] = []
  const pedestal = (x: number, z: number) => {
    pieces.push(place(new CylinderGeometry(0.05, 0.05, 0.008, 10), [x, 0.004, z]))
    pieces.push(cylinderBetween([x, 0.008, z], [x, raisedFloor - 0.05, z], 0.012, 8))
    pieces.push(block([0.09, 0.01, 0.09], [x, raisedFloor - 0.045, z]))
  }
  const frontZ = Math.floor(half / tileSize) * tileSize
  for (let x = Math.ceil(floorWestEdge / tileSize) * tileSize; x < half; x += tileSize) pedestal(x, frontZ)
  for (let z = -Math.floor(half / tileSize) * tileSize; z < frontZ; z += tileSize) pedestal(floorWestEdge + 0.4, z)
  pieces.push(blockBetween([floorWestEdge, raisedFloor - 0.09, frontZ - 0.015], [half, raisedFloor - 0.05, frontZ + 0.015]))
  pieces.push(blockBetween([floorWestEdge + 0.385, raisedFloor - 0.09, -half], [floorWestEdge + 0.415, raisedFloor - 0.05, frontZ]))
  return pieces
}

function infrastructureGeometry(): BufferGeometry {
  const pieces: BufferGeometry[] = [...pedestalGeometry()]
  const westX = rows[0].x - 0.3
  const eastX = rows[rows.length - 1].x + 0.3
  for (const row of rows) {
    for (const z of [rowStartZ - 0.03, rowEndZ + 0.03]) {
      pieces.push(block([rackDepth + 0.04, rackHeight + 0.04, 0.05], [row.x, raisedFloor + (rackHeight + 0.04) / 2, z]))
    }
    for (const side of [-1, 1]) {
      pieces.push(block([0.015, 0.07, rowLength + 0.4], [row.x + side * 0.17, trayBottom + 0.035, (rowStartZ + rowEndZ) / 2]))
    }
    for (let z = rowStartZ - 0.1; z <= rowEndZ + 0.1; z += 0.3) {
      pieces.push(block([0.34, 0.012, 0.025], [row.x, trayBottom + 0.006, z]))
    }
    for (let z = rowStartZ + 0.4; z < rowEndZ; z += 2.1) {
      for (const side of [-1, 1]) pieces.push(cylinderBetween([row.x + side * 0.17, trayBottom + 0.07, z], [row.x + side * 0.17, ceiling, z], 0.006, 6))
    }
    for (let z = pipeStartZ + 0.6; z < pipeEndZ; z += hangerSpacing) {
      pieces.push(place(new TorusGeometry(pipeRadius + 0.012, 0.011, 6, 20), [row.x, pipeY, z], [0, 0, 0]))
      pieces.push(cylinderBetween([row.x, pipeY + pipeRadius + 0.02, z], [row.x, ceiling - 0.04, z], 0.008, 6))
    }
    pieces.push(cylinderBetween([row.x, pipeY, pipeEndZ], [row.x, pipeY + 0.3, pipeEndZ], pipeRadius, 16))
    for (const y of [pipeY + 0.06, pipeY + 0.24]) {
      pieces.push(place(new CylinderGeometry(pipeRadius + 0.03, pipeRadius + 0.03, 0.025, 18), [row.x, y, pipeEndZ]))
    }
  }
  for (let z = pipeStartZ + 0.6; z < pipeEndZ; z += hangerSpacing) {
    pieces.push(blockBetween([westX, ceiling - 0.045, z - 0.021], [eastX, ceiling, z + 0.021]))
  }
  pieces.push(cylinderBetween([westX, pipeY + 0.3, pipeEndZ], [eastX, pipeY + 0.3, pipeEndZ], 0.13, 16))
  for (const x of aisleCentres) {
    pieces.push(blockBetween([x - 0.07, luminaire.y, luminaire.startZ], [x + 0.07, luminaire.y + 0.06, luminaire.endZ]))
    for (const z of [luminaire.startZ + 0.3, (luminaire.startZ + luminaire.endZ) / 2, luminaire.endZ - 0.3]) {
      pieces.push(cylinderBetween([x, luminaire.y + 0.06, z], [x, ceiling, z], 0.005, 6))
    }
  }
  return merge(pieces)
}

function cableGeometry(): BufferGeometry {
  const random = createRandom(1717)
  const tones = ['#262A31', '#1D2747', '#34383F', '#2A3550'] as const
  const pieces: BufferGeometry[] = []
  for (const row of rows) {
    for (const offset of [-0.09, 0, 0.09]) {
      const height = 0.03 + random() * 0.03
      pieces.push(tintVertices(block([0.07, height, rowLength + 0.3], [row.x + offset, trayBottom + 0.012 + height / 2, (rowStartZ + rowEndZ) / 2]), tones[Math.floor(random() * tones.length)]))
    }
    for (let rack = 0; rack < racksPerRow; rack += 2) {
      const z = rowStartZ + rackPitch * (rack + 0.5)
      pieces.push(tintVertices(block([0.06, trayBottom - rackTop, 0.05], [row.x - row.facing * 0.26, (trayBottom + rackTop) / 2, z]), tones[rack % tones.length]))
    }
  }
  return merge(pieces)
}

function diffuserGeometry(): BufferGeometry {
  return merge(aisleCentres.map((x) => blockBetween([x - 0.05, luminaire.y - 0.01, luminaire.startZ + 0.04], [x + 0.05, luminaire.y, luminaire.endZ - 0.04])))
}

function endBarGeometry(): BufferGeometry {
  return merge(rows.map((row) => tintVertices(block([rackDepth * 0.8, 0.04, 0.02], [row.x, rackTop - 0.08, rowEndZ + 0.065]), row.color)))
}

function signGeometry(): BufferGeometry {
  return merge(rows.map((row, index) => labelRowUVs(place(new PlaneGeometry(0.84, 0.105), [row.x, rackTop - 0.22, rowEndZ + 0.058]), index, rows.length)))
}

function ledLayout(): { matrices: Matrix4[]; leds: Led[] } {
  const random = createRandom(404)
  const matrices: Matrix4[] = []
  const leds: Led[] = []
  rows.forEach((row, rowIndex) => {
    for (let rack = 0; rack < racksPerRow; rack += 1) {
      const z = rowStartZ + rackPitch * (rack + 0.5)
      for (const [face, count] of [[row.facing, ledsPerFront], [-row.facing, ledsPerRear]] as const) {
        for (let led = 0; led < count; led += 1) {
          const y = raisedFloor + 0.2 + random() * (rackHeight - 0.45)
          matrices.push(composeMatrix([row.x + face * (rackDepth / 2 - 0.016), y, z - 0.2 + random() * 0.4]))
          leds.push({ row: rowIndex, frequency: 0.15 + random() * (ledBlinkLimit - 0.15), phase: random(), duty: 0.35 + random() * 0.45, steady: random() < 0.45 })
        }
      }
    }
  })
  return { matrices, leds }
}

function pipeGeometry(radius: number, radialSegments: number): BufferGeometry {
  return merge(rows.map((row) => cylinderBetween([row.x, pipeY, pipeStartZ], [row.x, pipeY, pipeEndZ], radius, radialSegments, true)))
}

export const createBackendFloor: FloorFactory = () => {
  const root = new Group()
  root.name = 'backend'
  root.position.y = floorBase.backend

  const rackSteel = steelMaterial({ color: '#24272C', metalness: 0.15, roughness: 0.48 })
  const faceMaterial = rackFaceMaterial()
  const racks = instances(rackGeometry(), rackSteel, rackMatrices())
  racks.material = [rackSteel, faceMaterial]
  racks.castShadow = true
  racks.receiveShadow = true

  const floor = new Mesh(raisedFloorGeometry(), raisedFloorMaterial())
  floor.receiveShadow = true

  const ledPlan = ledLayout()
  const rowColors = rows.map((row) => new Color(row.color))
  const leds = instances(new BoxGeometry(0.006, 0.012, 0.022), new MeshBasicMaterial(), ledPlan.matrices, ledPlan.leds.map((led) => rowColors[led.row]))

  const infrastructure = new Mesh(infrastructureGeometry(), steelMaterial({ color: '#4A4F57', metalness: 0.3, roughness: 0.5 }))
  infrastructure.castShadow = true
  infrastructure.receiveShadow = true
  const cables = new Mesh(cableGeometry(), new MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0 }))
  cables.castShadow = true

  const diffuserEmitter = createEmitter('#D8E3FF', 2.2)
  const diffusers = new Mesh(diffuserGeometry(), diffuserEmitter.material)
  const endBarEmitter = createEmitter('#ffffff', 1.2, { vertexColors: true })
  const endBars = new Mesh(endBarGeometry(), endBarEmitter.material)
  const signTexture = createLabelAtlas(rows.map((row, index) => `row ${String.fromCharCode(65 + index)}  ${row.label}`), { ink: '#D9D5CC', paper: '#14171B', weight: 600, size: 64 })
  const signs = new Mesh(signGeometry(), new MeshStandardMaterial({ map: signTexture, roughness: 0.6, metalness: 0, polygonOffset: true, polygonOffsetFactor: -1 }))

  const pipes = new Mesh(pipeGeometry(pipeRadius, 18), glassMaterial(0.26))
  const coreEmitter = createEmitter('#5F7DFF', 0.18)
  const cores = new Mesh(pipeGeometry(0.01, 6), coreEmitter.material)
  const random = createRandom(808)
  const packetPlan: Packet[] = []
  rows.forEach((_, row) => {
    const speed = 0.06 + random() * 0.05
    for (let packet = 0; packet < packetsPerPipe; packet += 1) {
      packetPlan.push({ row, offset: packet / packetsPerPipe + random() * 0.05, speed })
    }
  })
  const packetEmitter = createEmitter('#7D98FF', 1.1)
  const packets = instances(new BoxGeometry(0.045, 0.045, 0.2), packetEmitter.material, packetPlan.map(() => composeMatrix([0, pipeY, 0])))
  packets.frustumCulled = false

  const detail = new Group()
  detail.add(leds, cables, signs, cores, packets)
  root.add(floor, racks, infrastructure, diffusers, endBars, pipes, detail)

  const ledColor = new Color()
  const packetMatrix = new Matrix4()
  const pipeLength = pipeEndZ - pipeStartZ
  let frozenTime = 0

  function update(frame: FrameState): void {
    const level = 0.25 + 0.75 * frame.world.practicals
    diffuserEmitter.set(2.2 * level)
    endBarEmitter.set(0.5 + 0.7 * level)
    detail.visible = nearChapter(frame.progress, chapterIndex.backend)
    if (!detail.visible) return
    const time = frame.reducedMotion ? frozenTime : frame.time
    frozenTime = time
    ledPlan.leds.forEach((led, index) => {
      const on = led.steady || frame.reducedMotion || (time * led.frequency + led.phase) % 1 < led.duty
      leds.setColorAt(index, ledColor.copy(rowColors[led.row]).multiplyScalar((on ? 2.2 : 0.18) * (0.6 + 0.4 * level)))
    })
    if (leds.instanceColor) leds.instanceColor.needsUpdate = true

    packetPlan.forEach((packet, index) => {
      const progress = (packet.offset + time * packet.speed) % 1
      packets.setMatrixAt(index, packetMatrix.makeTranslation(rows[packet.row].x, pipeY, pipeStartZ + 0.2 + progress * (pipeLength - 0.4)))
    })
    packets.instanceMatrix.needsUpdate = true
  }

  function dispose(): void {
    disposeTree(root)
    faceMaterial.map?.dispose()
    signTexture.dispose()
  }

  return { id: 'backend', root, proxies: [], update, dispose }
}
