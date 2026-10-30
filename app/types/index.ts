import type { Color } from '@deck.gl/core/typed'

export type Bound = [[number, number], [number, number]]

export interface Station {
  id: string
  name: string
  coord: [number, number]
}

export interface Line {
  id: string
  cityId: string
  name: string
  color: Color
  bound: Bound
  stations: Station[]
  polyline: [number, number][]
}

export interface City {
  id: string
  name: string
  lines: Line[]
  bound: Bound
  ready: boolean
}

export type Dataset = City[]

/** pipeline/raw/data.json 中的原始结构（GCJ02） */
export interface RawStation {
  id: string
  name: string
  lat: number
  lng: number
}

export interface RawLine {
  id: string
  name: string
  color: string
  stations: RawStation[]
  polyline: number[]
  fullPolyline: [number, number][]
}

export interface RawCity {
  id: string
  name: string
  cityname: string
  lines: RawLine[]
}

/** data/cities.json 中的轻量城市目录 */
export interface CityMeta {
  id: string
  name: string
  cityname: string
  lineCount: number
  stationCount: number
}

/** data/manifest.json */
export interface DataManifest {
  version: string
  updatedAt: string
  counts: {
    cities: number
    lines: number
    stations: number
  }
  defaultCityIds: string[]
}

/** data/search.json 中的站点搜索条目 */
export interface SearchEntry {
  name: string
  cityId: string
  lineId: string
  stationId: string
  color: string
  lines: string[]
}
