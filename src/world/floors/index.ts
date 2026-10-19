import type { FloorFactory } from '../types'
import { createAiCoreFloor } from './ai-core'
import { createBackendFloor } from './backend'
import { createBeaconFloor } from './beacon'
import { createCloudFloor } from './cloud'
import { createDataFloor } from './data'
import { createFrontendFloor } from './frontend'
import { createLoungeFloor } from './lounge'
import { createRocketFloor } from './rocket'
import { createTeachingFloor } from './teaching'

export const floorFactories: readonly FloorFactory[] = [
  createFrontendFloor,
  createBackendFloor,
  createCloudFloor,
  createDataFloor,
  createAiCoreFloor,
  createRocketFloor,
  createTeachingFloor,
  createLoungeFloor,
  createBeaconFloor,
]
