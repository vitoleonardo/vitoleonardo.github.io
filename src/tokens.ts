import type { FigureId } from './types'

export const tokens = {
  colour: {
    ink: '#111111',
    blue: '#1F4BFF',
    red: '#B8251E',
    nightText: '#EEF0FF',
  },
  ground: {
    hero: '#ECEBE6',
    index: '#ECEBE6',
    frontend: '#E8E8E6',
    backend: '#E1E2E8',
    cloud: '#D8DBE6',
    data: '#CBD1E4',
    'ai-products': '#BEC5DF',
    'ai-coding': '#E7E3DD',
    teaching: '#2A3260',
    about: '#070914',
    'say-hi': '#05060D',
  } satisfies Record<FigureId, string>,
}
