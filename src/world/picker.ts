import { type Object3D, type PerspectiveCamera, Raycaster, Vector2 } from 'three'

export type Picker = (clientX: number, clientY: number, objects: Object3D[]) => Object3D | null

export function createPicker(camera: PerspectiveCamera, canvas: HTMLCanvasElement): Picker {
  const raycaster = new Raycaster()
  const ndc = new Vector2()

  return (clientX, clientY, objects) => {
    const width = Math.max(1, canvas.clientWidth)
    const height = Math.max(1, canvas.clientHeight)
    ndc.set((clientX / width) * 2 - 1, -(clientY / height) * 2 + 1)
    raycaster.setFromCamera(ndc, camera)
    const [nearest] = raycaster.intersectObjects(objects, false)
    return nearest ? nearest.object : null
  }
}
