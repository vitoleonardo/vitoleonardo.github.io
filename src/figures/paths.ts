import type { FigureId } from '../types'

const SPIRAL_STEP = 0.06

function format(value: number): string {
  return String(Math.round(value * 10) / 10)
}

function doubleSpiralPath(centreX: number, centreY: number, outerRadius: number, pitch: number): string {
  const spread = pitch / Math.PI
  const turns = outerRadius / spread
  const startAngle = Math.PI / 2 - turns
  const parts = [`M -60 ${format(centreY + outerRadius)} L ${format(centreX)} ${format(centreY + outerRadius)}`]
  for (let theta = turns - SPIRAL_STEP; theta > 0; theta -= SPIRAL_STEP) {
    const angle = startAngle + theta
    parts.push(`L ${format(centreX + spread * theta * Math.cos(angle))} ${format(centreY + spread * theta * Math.sin(angle))}`)
  }
  for (let theta = 0; theta < turns; theta += SPIRAL_STEP) {
    const angle = startAngle + theta
    parts.push(`L ${format(centreX - spread * theta * Math.cos(angle))} ${format(centreY - spread * theta * Math.sin(angle))}`)
  }
  parts.push(`L ${format(centreX)} ${format(centreY - outerRadius)} L 1340 ${format(centreY - outerRadius)}`)
  return parts.join(' ')
}

export const MOBILE_FIGURE_PATHS: Partial<Record<FigureId, { d: string; strands?: string[] }>> = {
  index: {
    d: 'M -60 30 Q 73 30 73 100 L 73 800 Q 73 870 -60 870',
  },
  frontend: {
    d: 'M -60 800 L 1140 800 Q 1240 800 1240 700 L 1240 180 Q 1240 80 1140 80 L 160 80 Q 60 80 60 180 L 60 780',
  },
  backend: {
    d: 'M -60 800 L 0 800 Q 80 800 80 720 L 80 200 Q 80 120 160 120 L 1100 120 Q 1185 120 1185 205 Q 1185 290 1100 290 L 400 290 Q 315 290 315 375 Q 315 460 400 460 L 1100 460 Q 1185 460 1185 545 Q 1185 630 1100 630 L 400 630 Q 315 630 315 715 Q 315 800 400 800 L 1340 800',
  },
  cloud: {
    d: 'M -60 800 L 100 800 L 100 630 L 370 630 L 370 460 L 640 460 L 640 290 L 910 290 L 910 120 L 1340 120',
  },
  data: {
    d: 'M -60 800 L 700 800 C 860 800 880 640 1040 640 L 1340 640',
    strands: [
      'M 120 110 C 120 520 700 640 1000 640',
      'M 420 110 C 420 480 780 630 1000 640',
      'M 720 110 C 720 440 880 620 1000 640',
      'M 1020 110 C 1020 400 1010 600 1000 640',
    ],
  },
  'ai-products': {
    d: 'M -60 800 L 600 800 C 660 800 700 780 700 720 A 300 300 0 0 0 1000 420 A 300 300 0 0 0 700 120 A 300 300 0 0 0 400 420 A 300 300 0 0 0 700 720 A 300 300 0 0 0 1000 420 L 1340 420',
  },
  'ai-coding': {
    d: 'M -60 800 L 500 800 C 740 800 800 720 800 580 L 800 120',
  },
  teaching: {
    d: doubleSpiralPath(640, 380, 300, 126),
  },
  'say-hi': {
    d: 'M -60 754 L 640 754 A 512 314 0 1 0 640 126 A 512 314 0 1 0 640 754',
  },
}
