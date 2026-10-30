import hexRgb from 'hex-rgb'
import first from 'lodash-es/first'
import rawData from '~/datasource/data.json'
import type { Bound, Dataset, Line, Station } from '~/types'

export function useDataset() {
  return ref<Dataset>(
    rawData.map((city) => {
      const lines = city.lines.map((line) => {
        const stations = line.stations.map(station => ({ id: station.id, name: station.name, coord: transformGCJ02([station.lng, station.lat]) }))
        const rawPolyline = (line.fullPolyline.length ? line.fullPolyline.map(p => transformGCJ02(p as [number, number])) : extractPolyline(line.polyline)) as [number, number][]
        // 站点级 polyline（点数与站点数相当）必须全量保留，否则线路会跨过中间车站；
        // 仅对远密于站点的密集轨迹降采样以提升性能
        const polyline = rawPolyline.length > line.stations.length * 2 ? partialPolyline(rawPolyline, 3) : rawPolyline
        return {
          id: line.id,
          cityId: city.id,
          name: line.name,
          bound: getLineBounds(stations),
          // FIXME alpha通道数值不对劲
          color: hexRgb(line.color, { format: 'array', alpha: 10 }),
          stations,
          polyline,
        }
      })

      return {
        id: city.id,
        name: city.name,
        bound: getCityBound(lines),
        lines,
      }
    }),
  )
}

function getLineBounds(stations: Station[]) {
  const firstStation = first(stations)
  let maxLat = firstStation?.coord[1] || 0
  let minLat = maxLat
  let maxLng = firstStation?.coord[0] || 0
  let minLng = maxLng

  stations.forEach((station) => {
    const lng = station.coord[0]
    const lat = station.coord[1]
    if (lng > maxLng)
      maxLng = lng
    if (lng < minLng)
      minLng = lng
    if (lat > maxLat)
      maxLat = lat
    if (lat < minLat)
      minLat = lat
  })

  return [[minLng, minLat], [maxLng, maxLat]] as Bound
}

function getCityBound(lines: Line[]) {
  let minLng = Infinity
  let minLat = Infinity
  let maxLng = -Infinity
  let maxLat = -Infinity

  for (const line of lines) {
    for (const [lng, lat] of line.bound) {
      if (lng < minLng)
        minLng = lng
      if (lng > maxLng)
        maxLng = lng
      if (lat < minLat)
        minLat = lat
      if (lat > maxLat)
        maxLat = lat
    }
  }

  return [[minLng, minLat], [maxLng, maxLat]] as Bound
}

function partialPolyline(polyline: [number, number][], step: number) {
  const newPolyline = [polyline[0]]

  polyline.slice(1, polyline.length - 1).forEach((p, idx) => {
    idx % step === 0 && newPolyline.push(p)
  })

  return [...newPolyline, polyline[polyline.length - 1]]
}
