#!/usr/bin/env node
/**
 * 用 OpenStreetMap 的真实线路几何替换 pipeline/raw/data.json 中由站点直线连接的 fullPolyline。
 *
 * 用法:
 *   pnpm data:osm                  # 全部城市
 *   pnpm data:osm -- --cities=深圳,广州
 *   pnpm data:osm -- --force       # 忽略缓存重新请求 Overpass
 *
 * 数据来源: OpenStreetMap route=subway 关系（ODbL）
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import gcoord from 'gcoord'
import { buildData } from './build-data.mjs'

function envNumber(name, fallback) {
  const value = Number(process.env[name])
  return Number.isFinite(value) ? value : fallback
}

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_FILE = path.join(__dirname, 'raw/data.json')
const CACHE_DIR = path.join(__dirname, '.cache/osm')
const OVERPASS_URL = process.env.OVERPASS_URL || 'https://overpass-api.de/api/interpreter'
const USER_AGENT = 'subway-map-osm-enrich/1.0 (https://github.com/nova-fable/subway)'
const BBOX_BUFFER = 0.15
const MATCH_RADIUS = 300
const SIMPLIFY_TOLERANCE = 0.00005
const MAX_PATH_GAP = 500
const REQUEST_INTERVAL_MS = Math.max(0, envNumber('OVERPASS_REQUEST_INTERVAL_MS', 1500))

let lastRequestAt = 0

async function waitForRequestSlot() {
  const wait = lastRequestAt + REQUEST_INTERVAL_MS - Date.now()
  if (wait > 0)
    await new Promise(resolve => setTimeout(resolve, wait))
  lastRequestAt = Date.now()
}

const args = process.argv.slice(2)
const force = args.includes('--force')
const citiesArg = args.find(arg => arg.startsWith('--cities='))
const onlyCities = citiesArg ? new Set(citiesArg.slice('--cities='.length).split(',').map(s => s.trim()).filter(Boolean)) : null

function toRadians(value) {
  return value * Math.PI / 180
}

function distanceMeters(a, b) {
  const lat = toRadians((a[1] + b[1]) / 2)
  const dx = (a[0] - b[0]) * 111320 * Math.cos(lat)
  const dy = (a[1] - b[1]) * 110540
  return Math.hypot(dx, dy)
}

function pointSegmentDistance(point, start, end) {
  const lat = toRadians((start[1] + end[1]) / 2)
  const scaleX = 111320 * Math.cos(lat)
  const scaleY = 110540
  const px = point[0] * scaleX
  const py = point[1] * scaleY
  const ax = start[0] * scaleX
  const ay = start[1] * scaleY
  const bx = end[0] * scaleX
  const by = end[1] * scaleY
  const dx = bx - ax
  const dy = by - ay
  const lengthSquared = dx * dx + dy * dy

  if (lengthSquared === 0)
    return Math.hypot(px - ax, py - ay)

  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

function nearestDistanceToPath(point, path) {
  let min = Infinity
  for (let i = 0; i < path.length - 1; i++)
    min = Math.min(min, pointSegmentDistance(point, path[i], path[i + 1]))
  return min
}

function getCityBounds(city) {
  let minLng = Infinity
  let minLat = Infinity
  let maxLng = -Infinity
  let maxLat = -Infinity

  for (const line of city.lines) {
    for (const station of line.stations) {
      const [lng, lat] = gcoord.transform([station.lng, station.lat], gcoord.GCJ02, gcoord.WGS84)
      minLng = Math.min(minLng, lng)
      minLat = Math.min(minLat, lat)
      maxLng = Math.max(maxLng, lng)
      maxLat = Math.max(maxLat, lat)
    }
  }

  return [minLat - BBOX_BUFFER, minLng - BBOX_BUFFER, maxLat + BBOX_BUFFER, maxLng + BBOX_BUFFER]
}

async function fetchOverpass(city) {
  const cacheFile = path.join(CACHE_DIR, `${city.id}.json`)
  if (!force) {
    try {
      return JSON.parse(await readFile(cacheFile, 'utf8'))
    }
    catch {}
  }

  const [south, west, north, east] = getCityBounds(city)
  const query = `[out:json][timeout:90];relation(${south},${west},${north},${east})["route"~"^(subway|light_rail|monorail)$"];out geom;`

  let lastError
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await waitForRequestSlot()
      const response = await fetch(OVERPASS_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': USER_AGENT,
        },
        body: new URLSearchParams({ data: query }),
      })

      if (!response.ok) {
        if (response.status === 429) {
          const retryAfter = Number(response.headers.get('retry-after'))
          if (retryAfter > 0)
            await new Promise(resolve => setTimeout(resolve, retryAfter * 1000))
        }
        throw new Error(`HTTP ${response.status}`)
      }

      const text = await response.text()
      const data = JSON.parse(text)
      await mkdir(CACHE_DIR, { recursive: true })
      await writeFile(cacheFile, text)
      return data
    }
    catch (error) {
      lastError = error
      await new Promise(resolve => setTimeout(resolve, attempt * 3000))
    }
  }

  throw new Error(`Overpass 请求失败: ${lastError?.message}`)
}

function assemblePath(relation) {
  const ways = relation.members
    .filter(member => member.type === 'way' && (!member.role || member.role === '') && member.geometry?.length > 1)
    .map(member => member.geometry.map(point => [point.lon, point.lat]))

  if (!ways.length)
    return []

  let path = ways[0].slice()

  for (let i = 1; i < ways.length; i++) {
    let way = ways[i]
    const distanceToStart = distanceMeters(path[path.length - 1], way[0])
    const distanceToEnd = distanceMeters(path[path.length - 1], way[way.length - 1])

    if (distanceToEnd < distanceToStart)
      way = way.slice().reverse()

    path = path.concat(way.slice(1))
  }

  return path.filter((point, index) => {
    if (index === 0)
      return true
    return point[0] !== path[index - 1][0] || point[1] !== path[index - 1][1]
  })
}

function maxGap(points) {
  let longest = 0
  for (let i = 1; i < points.length; i++)
    longest = Math.max(longest, distanceMeters(points[i - 1], points[i]))
  return longest
}

function pathLength(points) {
  let total = 0
  for (let i = 1; i < points.length; i++)
    total += distanceMeters(points[i - 1], points[i])
  return total
}

function splitPathSegments(path) {
  const segments = []
  let segment = []

  for (const point of path) {
    if (segment.length && distanceMeters(segment[segment.length - 1], point) > MAX_PATH_GAP) {
      if (segment.length > 1)
        segments.push(segment)
      segment = [point]
    }
    else {
      segment.push(point)
    }
  }

  if (segment.length > 1)
    segments.push(segment)
  return segments
}

function connectPathSegments(segments) {
  if (segments.length <= 1)
    return segments[0] ?? []

  let startIndex = 0
  let longest = -1
  segments.forEach((segment, index) => {
    const length = pathLength(segment)
    if (length > longest) {
      longest = length
      startIndex = index
    }
  })

  const remaining = segments.filter((_, index) => index !== startIndex)
  let chain = segments[startIndex]

  while (remaining.length) {
    const chainStart = chain[0]
    const chainEnd = chain[chain.length - 1]
    let best = null

    remaining.forEach((segment, index) => {
      const options = [
        { distance: distanceMeters(chainEnd, segment[0]), index, mode: 'append' },
        { distance: distanceMeters(chainEnd, segment[segment.length - 1]), index, mode: 'append-reverse' },
        { distance: distanceMeters(chainStart, segment[segment.length - 1]), index, mode: 'prepend' },
        { distance: distanceMeters(chainStart, segment[0]), index, mode: 'prepend-reverse' },
      ]
      for (const option of options) {
        if (!best || option.distance < best.distance)
          best = option
      }
    })

    const segment = remaining.splice(best.index, 1)[0]
    if (best.mode === 'append')
      chain = chain.concat(segment.slice(1))
    else if (best.mode === 'append-reverse')
      chain = chain.concat(segment.slice().reverse().slice(1))
    else if (best.mode === 'prepend')
      chain = segment.slice(0, -1).concat(chain)
    else
      chain = segment.slice().reverse().slice(0, -1).concat(chain)
  }

  return chain
}

function simplifyPath(points, tolerance) {
  if (points.length <= 2)
    return points

  const squaredTolerance = tolerance * tolerance
  const simplified = [points[0]]

  function getSquaredDistance(point, start, end) {
    let x = start[0]
    let y = start[1]
    let dx = end[0] - x
    let dy = end[1] - y

    if (dx !== 0 || dy !== 0) {
      const t = ((point[0] - x) * dx + (point[1] - y) * dy) / (dx * dx + dy * dy)
      if (t > 1) {
        x = end[0]
        y = end[1]
      }
      else if (t > 0) {
        x += dx * t
        y += dy * t
      }
    }

    dx = point[0] - x
    dy = point[1] - y
    return dx * dx + dy * dy
  }

  function step(first, last) {
    let maxSquaredDistance = squaredTolerance
    let index = -1

    for (let i = first + 1; i < last; i++) {
      const squaredDistance = getSquaredDistance(points[i], points[first], points[last])
      if (squaredDistance > maxSquaredDistance) {
        index = i
        maxSquaredDistance = squaredDistance
      }
    }

    if (index === -1)
      return

    step(first, index)
    simplified.push(points[index])
    step(index, last)
  }

  step(0, points.length - 1)
  simplified.push(points[points.length - 1])
  return simplified
}

function normalizeRef(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}

function extractLineRef(name) {
  const match = String(name || '').match(/[A-Za-z]*\d+[A-Za-z]*/)
  return match ? normalizeRef(match[0]) : ''
}

function scoreRelation(relation, path, stations, line) {
  const matchedStations = stations.filter(station => nearestDistanceToPath(station, path) <= MATCH_RADIUS).length
  const stationCoverage = stations.length ? matchedStations / stations.length : 0

  const stops = relation.members
    .filter(member => member.type === 'node' && member.role?.includes('stop') && member.lat != null && member.lon != null)
    .map(member => [member.lon, member.lat])

  const matchedStops = stops.filter(stop => stations.some(station => distanceMeters(station, stop) <= MATCH_RADIUS)).length
  const stopCoverage = stops.length ? matchedStops / stops.length : 0

  const relationRefs = [relation.tags.ref, relation.tags.name, relation.tags['name:zh'], relation.tags['name:en']]
    .map(normalizeRef)
    .filter(Boolean)
  const lineRef = extractLineRef(line.name)
  const refMatched = !!lineRef && relationRefs.some(ref => ref.includes(lineRef) || lineRef.includes(ref))

  return {
    score: stationCoverage * 1.5 + stopCoverage + (refMatched ? 0.4 : 0),
    stationCoverage,
    stopCoverage,
    refMatched,
  }
}

function encodePolyline(points) {
  const coordinates = [points[0][1], points[0][0]]
  for (let i = 1; i < points.length; i++) {
    coordinates.push(Math.round((points[i][1] - points[i - 1][1]) * 1e6))
    coordinates.push(Math.round((points[i][0] - points[i - 1][0]) * 1e6))
  }
  return coordinates
}

async function main() {
  console.log(`Overpass 请求策略: 串行、间隔 ${REQUEST_INTERVAL_MS}ms，缓存命中时不请求`)
  const dataset = JSON.parse(await readFile(DATA_FILE, 'utf8'))
  const cities = onlyCities ? dataset.filter(city => onlyCities.has(city.name) || onlyCities.has(city.id)) : dataset

  let enriched = 0
  let skipped = 0

  for (const city of cities) {
    let relations
    try {
      const data = await fetchOverpass(city)
      relations = data.elements || []
    }
    catch (error) {
      console.warn(`[${city.name}] ${error.message}`)
      skipped += city.lines.length
      continue
    }

    const candidates = relations
      .map(relation => {
        const rawPath = assemblePath(relation)
        const connected = connectPathSegments(splitPathSegments(rawPath))
        const rawSimplified = simplifyPath(rawPath, SIMPLIFY_TOLERANCE)
        const connectedSimplified = simplifyPath(connected, SIMPLIFY_TOLERANCE)
        const useConnected = maxGap(connectedSimplified) <= maxGap(rawSimplified)
        const path = useConnected ? connected : rawPath
        const simplified = useConnected ? connectedSimplified : rawSimplified
        return path.length > 1 ? { relation, rawPath, path, simplified } : null
      })
      .filter(Boolean)

    for (const line of city.lines) {
      const stations = line.stations.map(station => {
        const [lng, lat] = gcoord.transform([station.lng, station.lat], gcoord.GCJ02, gcoord.WGS84)
        return [lng, lat]
      })

      let best = null
      for (const candidate of candidates) {
        const result = scoreRelation(candidate.relation, candidate.rawPath, stations, line)
        if (!best || result.score > best.result.score)
          best = { ...candidate, result }
      }

      if (!best || (best.result.stationCoverage < 0.45 && !(best.result.refMatched && best.result.stationCoverage >= 0.3))) {
        skipped++
        continue
      }

      const simplified = best.simplified
      if (simplified.length < 2) {
        skipped++
        continue
      }

      const gcj02 = simplified.map(([lng, lat]) => gcoord.transform([lng, lat], gcoord.WGS84, gcoord.GCJ02))
      line.fullPolyline = gcj02
      line.polyline = encodePolyline(gcj02)
      enriched++

      const coverage = Math.round(best.result.stationCoverage * 100)
      console.log(`[${city.name}] ${line.name} <- OSM ${best.relation.id} (站点覆盖 ${coverage}%, ${simplified.length} 点)`)
    }

    await writeFile(DATA_FILE, `${JSON.stringify(dataset, null, 2)}\n`)
  }

  await writeFile(DATA_FILE, `${JSON.stringify(dataset, null, 2)}\n`)
  console.log(`\n完成: 更新 ${enriched} 条线路，跳过 ${skipped} 条（保留原有平滑兜底）`)

  await buildData()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
