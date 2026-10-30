import gcoord from 'gcoord'
import chunk from 'lodash-es/chunk'

type LAT = number
type LNG = number

export function transformGCJ02(raw: [LAT, LNG]) {
  return gcoord.transform(raw, gcoord.GCJ02, gcoord.WGS84)
}

export function extractPolyline(polyline: number[]) {
  const coords: number[] = [...polyline]
  for (let i = 2; i < coords.length; i++)
    coords[i] = coords[i - 2] + coords[i] / 1000000

  return chunk(coords, 2).map(a => transformGCJ02(a.reverse() as [number, number]))
}

type Point = [number, number]

function distance(a: Point, b: Point) {
  return Math.hypot(a[0] - b[0], a[1] - b[1])
}

function lerp(a: Point, b: Point, start: number, end: number, t: number): Point {
  const span = end - start
  if (span === 0)
    return [a[0], a[1]]

  const weight = (t - start) / span
  return [a[0] + (b[0] - a[0]) * weight, a[1] + (b[1] - a[1]) * weight]
}

function catmullRom(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
  const d01 = Math.sqrt(distance(p0, p1))
  const d12 = Math.sqrt(distance(p1, p2))
  const d23 = Math.sqrt(distance(p2, p3))

  if (d12 === 0)
    return [p1[0], p1[1]]

  if (d01 === 0 || d23 === 0)
    return lerp(p1, p2, 0, 1, t)

  const t0 = 0
  const t1 = t0 + d01
  const t2 = t1 + d12
  const t3 = t2 + d23
  const tt = t1 + (t2 - t1) * t

  const a1 = lerp(p0, p1, t0, t1, tt)
  const a2 = lerp(p1, p2, t1, t2, tt)
  const a3 = lerp(p2, p3, t2, t3, tt)
  const b1 = lerp(a1, a2, t0, t2, tt)
  const b2 = lerp(a2, a3, t1, t3, tt)
  return lerp(b1, b2, t1, t2, tt)
}

export function smoothPolyline(points: Point[], segments = 10): Point[] {
  if (points.length < 3)
    return points

  const smoothed: Point[] = []
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[i + 2] ?? p2

    for (let s = 0; s < segments; s++)
      smoothed.push(catmullRom(p0, p1, p2, p3, s / segments))
  }

  smoothed.push(points[points.length - 1])
  return smoothed
}
