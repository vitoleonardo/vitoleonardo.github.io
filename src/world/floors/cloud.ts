import { BoxGeometry, Color, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, SphereGeometry, TorusGeometry, type BufferGeometry, type Matrix4 } from 'three'
import { block, composeMatrix, instances, merge, place, projectWorldUVs, scaleUVs } from '../geometry'
import type { FloorFactory, FrameState, Vec3 } from '../types'
import { chapterIndex, chapterReveal, concreteMaterial, disposeTree, floorBase, palette } from './kit'

const containerSize: Vec3 = [2.4, 1.02, 0.98]
const containerColors = {
  docker: '#2B4FD8',
  concrete: '#4D545F',
  ochre: '#8C6A36',
  rust: '#743A2A',
} as const
const stackColumns = [2.2, 4.8] as const
const stackRows = [-6.1, -5, -3.9, -2.8] as const
const stackLevels = [3, 2, 3, 1, 2, 3, 1, 2] as const
const stackPalette = [containerColors.docker, containerColors.concrete, containerColors.ochre, containerColors.docker, containerColors.rust, containerColors.concrete] as const
const layerSteps = ['Docker', 'CI/CD', 'Terraform', 'AWS'] as const
const stepWidth = 2.8
const stepDepth = 1.2
const stepRise = 0.4
const stepCenterX = -5.3
const firstStepFrontZ = 3.4
const gridBounds = { minX: -3.8, maxX: 6.6, minZ: -6.7, maxZ: 6.7 } as const
const gridTile = 4

function stepFrontZ(step: number): number {
  return firstStepFrontZ - step * stepDepth
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
        matrices.push(composeMatrix([x, containerSize[1] * (level + 0.5) + level * 0.02, z]))
        colors.push(stackPalette[(stack + level * 2) % stackPalette.length])
      }
      stack += 1
    }
  }
  const dockerStepTop = stepRise
  matrices.push(composeMatrix([stepCenterX, dockerStepTop + 0.21, stepPropZ(0)], [0, 0.3, 0], [0.42, 0.42, 0.42]))
  colors.push(containerColors.docker)
  return { matrices, colors }
}

function containerGeometry(): BufferGeometry {
  const [length, height, depth] = containerSize
  return merge([
    block([length - 0.08, height - 0.04, depth - 0.04], [0, 0, 0]),
    block([0.06, height, depth], [-length / 2 + 0.03, 0, 0]),
    block([0.06, height, depth], [length / 2 - 0.03, 0, 0]),
  ])
}

function stepGeometry(): BufferGeometry {
  const steps = layerSteps.map((_, step) => {
    const height = stepRise * (step + 1)
    return block([stepWidth, height, stepDepth], [stepCenterX, height / 2, stepFrontZ(step) - stepDepth / 2])
  })
  return merge(steps)
}

function layerPropGeometry(): BufferGeometry {
  const pieces: BufferGeometry[] = []
  const ciTop = stepRise * 2
  pieces.push(place(new TorusGeometry(0.32, 0.05, 10, 40), [stepCenterX, ciTop + 0.4, stepPropZ(1)], [0, 0.4, 0]))
  const terraformTop = stepRise * 3
  for (let plate = 0; plate < 3; plate += 1) {
    pieces.push(block([0.7, 0.06, 0.7], [stepCenterX, terraformTop + 0.06 + plate * 0.16, stepPropZ(2)], [0, plate * 0.18, 0]))
  }
  const awsTop = stepRise * 4
  for (const [dx, dy, radius] of [[-0.28, 0.24, 0.24], [0.05, 0.36, 0.32], [0.36, 0.22, 0.22]] as const) {
    pieces.push(place(new SphereGeometry(radius, 16, 10), [stepCenterX + dx, awsTop + dy, stepPropZ(3)]))
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
    roughness: 0.45,
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
    new MeshStandardMaterial({ roughness: 0.62, metalness: 0.35 }),
    layout.matrices,
    layout.colors,
  )
  containers.castShadow = true
  containers.receiveShadow = true

  const steps = new Mesh(projectWorldUVs(stepGeometry(), 2.4), concreteMaterial(textures))
  steps.castShadow = true
  steps.receiveShadow = true

  const stripColor = new Color(palette.signal)
  const stripMatrices = layerSteps.map((_, step) =>
    composeMatrix([stepCenterX, stepRise * (step + 1) - 0.03, stepFrontZ(step) + 0.012], [0, 0, 0], [stepWidth - 0.1, 0.04, 0.02]),
  )
  const strips = instances(
    new BoxGeometry(1, 1, 1),
    new MeshBasicMaterial(),
    stripMatrices,
    stripMatrices.map(() => stripColor.clone().multiplyScalar(0.08)),
  )

  const props = new Mesh(layerPropGeometry(), new MeshStandardMaterial({ color: '#B9B6AD', roughness: 0.5, metalness: 0.1 }))
  props.castShadow = true

  root.add(grid, containers, steps, strips, props)

  const scratch = new Color()

  function update(frame: FrameState): void {
    const reveal = chapterReveal(frame.progress, chapterIndex.cloud)
    gridMaterial.emissiveIntensity = 0.35 + reveal * 0.5
    layerSteps.forEach((_, step) => {
      const lit = Math.min(1, Math.max(0, (reveal - step / layerSteps.length) * layerSteps.length))
      strips.setColorAt(step, scratch.copy(stripColor).multiplyScalar(0.08 + lit * 2.4))
    })
    if (strips.instanceColor) strips.instanceColor.needsUpdate = true
  }

  function dispose(): void {
    disposeTree(root)
  }

  return { id: 'cloud', root, proxies: [], update, dispose }
}
