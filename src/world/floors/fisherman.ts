import { Mesh, MeshStandardMaterial, type BufferGeometry } from 'three'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

const modelPath = 'models/fisherman.glb'

export type Fisherman = Mesh<BufferGeometry, MeshStandardMaterial>

function isFisherman(node: unknown): node is Fisherman {
  return node instanceof Mesh && node.material instanceof MeshStandardMaterial
}

export async function loadFisherman(): Promise<Fisherman> {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
  const gltf = await loader.loadAsync(`${import.meta.env.BASE_URL}${modelPath}`)
  const mesh = gltf.scene.getObjectByName('fisherman')
  if (!isFisherman(mesh)) throw new Error(`${modelPath} must hold one textured mesh named fisherman`)
  mesh.removeFromParent()
  return mesh
}

export function disposeFisherman(mesh: Fisherman): void {
  mesh.geometry.dispose()
  mesh.material.map?.dispose()
  mesh.material.dispose()
}
