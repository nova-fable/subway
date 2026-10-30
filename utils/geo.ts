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
