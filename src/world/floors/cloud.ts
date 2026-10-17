import {
  BoxGeometry,
  BufferGeometry,
  Color,
  ConeGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  SphereGeometry,
  TorusGeometry,
  type Matrix4,
} from 'three'
import { block, blockBetween, composeMatrix, cylinderBetween, instances, merge, place, scaleUVs, strut, tintVertices } from '../geometry'
import { createLabelAtlas, labelRowUVs } from '../textures'
import type { FloorFactory, FrameState, Vec3 } from '../types'
import { chapterIndex, chapterReveal, createEmitter, disposeTree, floorBase, nearChapter, palette, patchSurface, steelMaterial, towerSpec, withSurfaceBreakup } from './kit'

const containerSize: Vec3 = [2.4, 1.02, 0.98]
const containerFrame = { rail: 0.05, post: 0.05, castingWidth: 0.07, castingHeight: 0.045 } as const
const corrugation = { pitch: 0.092, depth: 0.017 } as const
const containerColors = {
  docker: '#2B4FD8',
  concrete: '#4D545F',
  ochre: '#8C6A36',
  rust: '#743A2A',
} as const
const stackColumns = [2.2, 4.8] as const
const stackRows = [-6.1, -5, -3.9, -2.8] as const
const stackLevels = [3, 2, 3, 1, 2, 3, 1, 2] as const
const stackGap = 0.02
const stackPalette = [containerColors.docker, containerColors.concrete, containerColors.ochre, containerColors.docker, containerColors.rust, containerColors.concrete] as const
const layerSteps = ['Docker', 'CI/CD', 'Terraform', 'AWS'] as const
const stepWidth = 2.8
const stepDepth = 1.2
const stepRise = 0.4
const stepCenterX = -5.3
const firstStepFrontZ = 3.4
const propX = stepCenterX - 0.55
const labelX = stepCenterX + 0.55
const deckThickness = 0.03
const stairEdge = { west: stepCenterX - stepWidth / 2, east: stepCenterX + stepWidth / 2 } as const
const railHeight = 0.95
const gridBounds = { minX: -3.8, maxX: 6.6, minZ: -6.7, maxZ: 6.7 } as const
const gridTile = 4
const ceiling = towerSpec.floorHeight - towerSpec.slabThickness
const ceilingPanels: readonly (readonly [number, number])[] = [[-2.2, -2.4], [-2.2, 1.2], [-2.2, 4.6], [1.8, -2.4], [1.8, 1.2], [1.8, 4.6]]
const panelSize = 0.6

function stepFrontZ(step: number): number {
  return firstStepFrontZ - step * stepDepth
}

function stepTop(step: number): number {
  return stepRise * (step + 1)
}

function stepPropZ(step: number): number {
  return stepFrontZ(step) - stepDepth / 2
}

function containerLayout(): { matrices: Matrix4[]; colors: string[] } {
  const matrices: Matrix4[] = []
  const colors: string[] = []
  let stack = 0
  for (const x of stackColumns) {
    for (const z of stackRows) {
      const levels = stackLevels[stack % stackLevels.length]
      for (let level = 0; level < levels; level += 1) {
        matrices.push(composeMatrix([x, containerSize[1] * (level + 0.5) + level * stackGap, z]))
        colors.push(stackPalette[(stack + level * 2) % stackPalette.length])
      }
      stack += 1
    }
  }
  matrices.push(composeMatrix([propX, stepTop(0) + 0.215, stepPropZ(0)], [0, 0.3, 0], [0.42, 0.42, 0.42]))
  colors.push(containerColors.docker)
  return { matrices, colors }
}

function corrugatedPanel(length: number, height: number): BufferGeometry {
  const pitchCount = Math.max(1, Math.round(length / corrugation.pitch))
  const pitch = length / pitchCount
  const profile: [number, number][] = []
  for (let index = 0; index < pitchCount; index += 1) {
    const start = -length / 2 + index * pitch
    profile.push([start, 0], [start + pitch * 0.35, 0], [start + pitch * 0.5, -corrugation.depth], [start + pitch * 0.85, -corrugation.depth])
  }
  profile.push([length / 2, 0])
  const positions: number[] = []
  const uvs: number[] = []
  const bottom = -height / 2
  const top = height / 2
  for (let index = 0; index < profile.length - 1; index += 1) {
    const [ax, az] = profile[index]
    const [bx, bz] = profile[index + 1]
    positions.push(ax, bottom, az, bx, bottom, bz, bx, top, bz, ax, bottom, az, bx, top, bz, ax, top, az)
    const au = ax / length + 0.5
    const bu = bx / length + 0.5
    uvs.push(au, 0, bu, 0, bu, 1, au, 0, bu, 1, au, 1)
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2))
  geometry.computeVertexNormals()
  return geometry
}

function containerGeometry(): BufferGeometry {
  const [length, height, depth] = containerSize
  const { rail, post, castingWidth, castingHeight } = containerFrame
  const halfLength = length / 2
  const halfHeight = height / 2
  const halfDepth = depth / 2
  const paint = '#ffffff'
  const shade = '#5a5a5a'
  const hole = '#141414'
  const pieces: BufferGeometry[] = []
  const add = (geometry: BufferGeometry, tint: string = paint) => pieces.push(tintVertices(geometry, tint))
  const panelLength = length - post * 2
  const panelHeight = height - rail * 2
  add(place(corrugatedPanel(panelLength, panelHeight), [0, 0, halfDepth - 0.004]))
  add(place(corrugatedPanel(panelLength, panelHeight), [0, 0, -halfDepth + 0.004], [0, Math.PI, 0]))
  add(place(corrugatedPanel(depth - post * 2, panelHeight), [-halfLength + 0.004, 0, 0], [0, -Math.PI / 2, 0]))
  add(block([length - 0.1, 0.02, depth - 0.06], [0, halfHeight - 0.03, 0]))
  add(block([length - 0.1, 0.02, depth - 0.06], [0, -halfHeight + 0.03, 0]), shade)
  for (const side of [-1, 1]) {
    add(block([length, rail, 0.04], [0, halfHeight - rail / 2, side * (halfDepth - 0.02)]))
    add(block([length, rail, 0.04], [0, -halfHeight + rail / 2, side * (halfDepth - 0.02)]))
    add(block([0.04, rail, depth], [side * (halfLength - 0.02), halfHeight - rail / 2, 0]))
    add(block([0.04, rail * 1.4, depth], [side * (halfLength - 0.02), -halfHeight + rail * 0.7, 0]))
    for (const end of [-1, 1]) {
      add(block([post, height, post], [side * (halfLength - post / 2), 0, end * (halfDepth - post / 2)]))
      for (const level of [-1, 1]) {
        const castingCentre: Vec3 = [side * (halfLength - castingWidth / 2 + 0.004), level * (halfHeight - castingHeight / 2 + 0.003), end * (halfDepth - castingWidth / 2 + 0.004)]
        add(block([castingWidth, castingHeight, castingWidth], castingCentre), '#cfcfcf')
        add(block([0.026, 0.016, 0.004], [castingCentre[0], castingCentre[1], end * (halfDepth + 0.0065)]), hole)
        add(block([0.004, 0.016, 0.026], [side * (halfLength + 0.0065), castingCentre[1], castingCentre[2]]), hole)
      }
    }
  }
  const doorX = halfLength - 0.012
  const leafDepth = depth / 2 - post - 0.004
  for (const side of [-1, 1]) {
    add(block([0.012, panelHeight, leafDepth], [doorX, 0, side * (leafDepth / 2 + 0.002)]))
    for (const y of [-0.28, 0, 0.28]) add(block([0.006, 0.03, leafDepth - 0.04], [doorX + 0.008, y, side * (leafDepth / 2 + 0.002)]), shade)
    for (const offset of [0.07, 0.3]) {
      const z = side * offset
      add(cylinderBetween([doorX + 0.016, -halfHeight + 0.07, z], [doorX + 0.016, halfHeight - 0.07, z], 0.007, 6), '#d8d8d8')
      add(block([0.012, 0.012, 0.09], [doorX + 0.024, -0.06, z - side * 0.045]), '#d8d8d8')
      for (const end of [-1, 1]) add(block([0.016, 0.03, 0.03], [doorX + 0.014, end * (halfHeight - 0.065), z]), shade)
    }
    for (const y of [-0.32, 0, 0.32]) add(place(new BoxGeometry(0.02, 0.05, 0.016), [doorX + 0.006, y, side * (halfDepth - 0.055)]), shade)
  }
  add(block([0.004, panelHeight, 0.006], [doorX + 0.008, 0, 0]), hole)
  return merge(pieces)
}

function treadPlateMaterial(): MeshStandardMaterial {
  return patchSurface(new MeshStandardMaterial({ color: '#8A9097', metalness: 0.4, roughness: 0.55 }), {
    key: 'tread-plate',
    albedo: `
      vec2 treadGrid = vSurfacePosition.xz / 0.032;
      vec2 lugCell = fract( treadGrid ) - 0.5;
      float lugParity = mod( floor( treadGrid.x ) + floor( treadGrid.y ), 2.0 );
      vec2 lugAxis = lugParity > 0.5 ? vec2( 0.7071, 0.7071 ) : vec2( 0.7071, -0.7071 );
      float lugShape = length( vec2( dot( lugCell, lugAxis ) / 0.42, dot( lugCell, vec2( -lugAxis.y, lugAxis.x ) ) / 0.1 ) );
      float lugPixel = max( fwidth( treadGrid.x ), fwidth( treadGrid.y ) );
      float lug = ( 1.0 - smoothstep( 0.85 - lugPixel * 4.0, 0.85 + lugPixel * 4.0, lugShape ) ) * ( 1.0 - smoothstep( 0.2, 0.55, lugPixel ) ) * step( 0.5, vSurfaceNormal.y );
      float treadWear = surfaceFbm( vSurfacePosition * 2.3 );
      diffuseColor.rgb *= ( 0.9 + 0.2 * treadWear ) * ( 1.0 + 0.3 * lug );
    `,
    roughness: `
      roughnessFactor = mix( roughnessFactor, 0.26, lug );
      roughnessFactor = clamp( roughnessFactor + ( treadWear - 0.5 ) * 0.2, 0.15, 1.0 );
    `,
  })
}

function deckGeometry(): BufferGeometry {
  return merge(
    layerSteps.map((_, step) =>
      blockBetween([stairEdge.west, stepTop(step) - deckThickness, stepFrontZ(step) - stepDepth], [stairEdge.east, stepTop(step), stepFrontZ(step)]),
    ),
  )
}

function stairStructureGeometry(): BufferGeometry {
  const pieces: BufferGeometry[] = panelTrimGeometry()
  const lastStep = layerSteps.length - 1
  const backZ = stepFrontZ(lastStep) - stepDepth
  layerSteps.forEach((_, step) => {
    const front = stepFrontZ(step)
    const top = stepTop(step)
    pieces.push(blockBetween([stairEdge.west, top - stepRise, front - 0.02], [stairEdge.east, top - deckThickness, front]))
    pieces.push(blockBetween([stairEdge.west - 0.01, top - 0.05, front - 0.02], [stairEdge.east + 0.01, top + 0.004, front + 0.02]))
    for (const x of [stairEdge.west + 0.04, stairEdge.east - 0.04]) {
      pieces.push(blockBetween([x - 0.03, 0, front - stepDepth + 0.01], [x + 0.03, top - deckThickness, front - stepDepth + 0.07]))
    }
    for (const offset of [0.3, 0.9]) {
      pieces.push(blockBetween([stairEdge.west + 0.07, top - deckThickness - 0.06, front - offset - 0.025], [stairEdge.east - 0.07, top - deckThickness, front - offset + 0.025]))
    }
    const railFront: Vec3 = [stairEdge.east - 0.03, top, front - 0.08]
    pieces.push(cylinderBetween(railFront, [railFront[0], top + railHeight, railFront[2]], 0.018, 8))
  })
  for (const x of [stairEdge.west + 0.04, stairEdge.east - 0.04]) {
    pieces.push(strut([x, 0.08, firstStepFrontZ - 0.02], [x, stepTop(lastStep) - deckThickness - 0.1, backZ + 0.1], 0.07))
  }
  pieces.push(blockBetween([stairEdge.west + 0.07, stepTop(lastStep) - deckThickness - 0.08, backZ], [stairEdge.east - 0.07, stepTop(lastStep) - deckThickness, backZ + 0.06]))
  const railX = stairEdge.east - 0.03
  const railStart: Vec3 = [railX, stepTop(0) + railHeight, stepFrontZ(0) - 0.08]
  const railEnd: Vec3 = [railX, stepTop(lastStep) + railHeight, stepFrontZ(lastStep) - 0.08]
  pieces.push(cylinderBetween(railStart, railEnd, 0.022, 10))
  pieces.push(cylinderBetween([railX, railStart[1] - 0.45, railStart[2]], [railX, railEnd[1] - 0.45, railEnd[2]], 0.014, 8))
  pieces.push(cylinderBetween(railEnd, [railX, railEnd[1], backZ + 0.05], 0.022, 10))
  pieces.push(cylinderBetween([railX, stepTop(lastStep), backZ + 0.05], [railX, railEnd[1], backZ + 0.05], 0.018, 8))
  const { minX, maxX, minZ, maxZ } = gridBounds
  pieces.push(blockBetween([minX - 0.04, 0, minZ - 0.04], [maxX + 0.04, 0.02, minZ]))
  pieces.push(blockBetween([minX - 0.04, 0, maxZ], [maxX + 0.04, 0.02, maxZ + 0.04]))
  pieces.push(blockBetween([minX - 0.04, 0, minZ], [minX, 0.02, maxZ]))
  pieces.push(blockBetween([maxX, 0, minZ], [maxX + 0.04, 0.02, maxZ]))
  return merge(pieces)
}

function riserLabelGeometry(): BufferGeometry {
  return merge(
    layerSteps.map((_, step) =>
      labelRowUVs(place(new PlaneGeometry(1.36, 0.17), [labelX, stepTop(step) - stepRise / 2 - 0.02, stepFrontZ(step) + 0.002]), step, layerSteps.length),
    ),
  )
}

function panelTrimGeometry(): BufferGeometry[] {
  const outer = panelSize / 2 + 0.03
  return ceilingPanels.flatMap(([x, z]) =>
    [-1, 1].flatMap((side) => [
      block([panelSize + 0.06, 0.03, 0.03], [x, ceiling - 0.015, z + side * outer]),
      block([0.03, 0.03, panelSize + 0.06], [x + side * outer, ceiling - 0.015, z]),
    ]),
  )
}

function panelDiffuserGeometry(): BufferGeometry {
  return merge(ceilingPanels.map(([x, z]) => place(new PlaneGeometry(panelSize, panelSize), [x, ceiling - 0.012, z], [Math.PI / 2, 0, 0])))
}

function layerPropGeometry(): BufferGeometry {
  const pieces: BufferGeometry[] = []
  const ciTop = stepTop(1)
  const loopCentre: Vec3 = [propX, ciTop + 0.4, stepPropZ(1)]
  pieces.push(place(new TorusGeometry(0.3, 0.045, 12, 48, Math.PI * 1.7), loopCentre, [0, 0.4, 0.4]))
  pieces.push(place(new ConeGeometry(0.08, 0.16, 16), [loopCentre[0] + 0.27, loopCentre[1] - 0.13, loopCentre[2] + 0.1], [0, 0.4, 2.3]))
  pieces.push(place(new BoxGeometry(0.34, 0.03, 0.2), [loopCentre[0], ciTop + 0.015, loopCentre[2]]))
  pieces.push(cylinderBetween([loopCentre[0], ciTop + 0.03, loopCentre[2]], [loopCentre[0], loopCentre[1] - 0.3, loopCentre[2]], 0.02, 8))
  const terraformTop = stepTop(2)
  for (let plate = 0; plate < 3; plate += 1) {
    pieces.push(block([0.7, 0.06, 0.7], [propX, terraformTop + 0.06 + plate * 0.16, stepPropZ(2)], [0, plate * 0.18, 0]))
  }
  const awsTop = stepTop(3)
  for (const [dx, dy, radius] of [[-0.28, 0.24, 0.24], [0.05, 0.36, 0.32], [0.36, 0.22, 0.22]] as const) {
    pieces.push(place(new SphereGeometry(radius, 20, 12), [propX + dx, awsTop + dy, stepPropZ(3)]))
  }
  return merge(pieces)
}

export const createCloudFloor: FloorFactory = (context) => {
  const { textures } = context
  const root = new Group()
  root.name = 'cloud'
  root.position.y = floorBase.cloud

  const gridWidth = gridBounds.maxX - gridBounds.minX
  const gridDepth = gridBounds.maxZ - gridBounds.minZ
  const gridMaterial = new MeshStandardMaterial({
    map: textures.blueprint,
    emissiveMap: textures.blueprint,
    emissive: '#ffffff',
    emissiveIntensity: 0.6,
    roughness: 0.32,
    metalness: 0,
    polygonOffset: true,
    polygonOffsetFactor: -1,
  })
  const grid = new Mesh(
    scaleUVs(
      place(new PlaneGeometry(gridWidth, gridDepth), [(gridBounds.minX + gridBounds.maxX) / 2, 0.012, (gridBounds.minZ + gridBounds.maxZ) / 2], [-Math.PI / 2, 0, 0]),
      gridWidth / gridTile,
      gridDepth / gridTile,
    ),
    gridMaterial,
  )
  grid.receiveShadow = true

  const layout = containerLayout()
  const containers = instances(
    containerGeometry(),
    withSurfaceBreakup(new MeshStandardMaterial({ vertexColors: true, roughness: 0.56, metalness: 0.12 }), {
      cellsPerMetre: 3.2,
      roughnessSwing: 0.14,
      albedoSwing: 0.12,
      verticalStretch: 2.6,
    }),
    layout.matrices,
    layout.colors,
  )
  containers.castShadow = true
  containers.receiveShadow = true

  const decks = new Mesh(deckGeometry(), treadPlateMaterial())
  decks.castShadow = true
  decks.receiveShadow = true
  const structure = new Mesh(stairStructureGeometry(), steelMaterial({ color: '#2F3339' }))
  structure.castShadow = true
  structure.receiveShadow = true
  const labelTexture = createLabelAtlas(layerSteps, { ink: 'rgba(233, 229, 219, 0.82)', paper: null, weight: 700, size: 76 })
  const labels = new Mesh(
    riserLabelGeometry(),
    new MeshStandardMaterial({ map: labelTexture, transparent: true, roughness: 0.7, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2 }),
  )

  const stripColor = new Color(palette.signal)
  const stripMatrices = layerSteps.map((_, step) =>
    composeMatrix([stepCenterX, stepTop(step) - 0.075, stepFrontZ(step) + 0.023], [0, 0, 0], [stepWidth - 0.1, 0.022, 0.012]),
  )
  const strips = instances(new BoxGeometry(1, 1, 1), new MeshBasicMaterial(), stripMatrices, stripMatrices.map(() => stripColor.clone().multiplyScalar(0.08)))

  const props = new Mesh(layerPropGeometry(), new MeshStandardMaterial({ color: '#C9C6BD', roughness: 0.38, metalness: 0 }))
  props.castShadow = true

  const panelEmitter = createEmitter('#E4E9FF', 1.5)
  const panels = new Mesh(panelDiffuserGeometry(), panelEmitter.material)

  const detail = new Group()
  detail.add(labels, props)
  root.add(grid, containers, decks, structure, strips, panels, detail)

  const scratch = new Color()

  function update(frame: FrameState): void {
    detail.visible = nearChapter(frame.progress, chapterIndex.cloud)
    const reveal = chapterReveal(frame.progress, chapterIndex.cloud)
    gridMaterial.emissiveIntensity = 0.35 + reveal * 0.5
    panelEmitter.set(1.5 * (0.25 + 0.75 * frame.world.practicals))
    layerSteps.forEach((_, step) => {
      const lit = Math.min(1, Math.max(0, (reveal - step / layerSteps.length) * layerSteps.length))
      strips.setColorAt(step, scratch.copy(stripColor).multiplyScalar(0.08 + lit * 2.4))
    })
    if (strips.instanceColor) strips.instanceColor.needsUpdate = true
  }

  function dispose(): void {
    disposeTree(root)
    labelTexture.dispose()
  }

  return { id: 'cloud', root, proxies: [], update, dispose }
}
