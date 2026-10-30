#!/usr/bin/env node
/**
 * 把 pipeline/raw/data.json 切分为前端按需加载的数据集：
 *   data/manifest.json      版本、更新时间、统计、默认城市
 *   data/cities.json        城市目录（轻量）
 *   data/search.json        站点搜索索引
 *   data/cities/{id}.json   每座城市的线路与站点
 *
 * 输出是幂等的：内容仅由源数据决定，重复执行不会产生无意义 diff。
 *
 * 用法: pnpm data:build
 */
import { createHash } from 'node:crypto'
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const SOURCE = path.join(__dirname, 'raw/data.json')
const OUTPUT_DIR = path.join(ROOT, 'data')
const CITIES_DIR = path.join(OUTPUT_DIR, 'cities')
const DEFAULT_CITY_IDS = ['4401', '4403', '8100', '4419']

function countStats(cities) {
  return cities.reduce((stats, city) => {
    stats.cities += 1
    stats.lines += city.lines.length
    stats.stations += city.lines.reduce((total, line) => total + line.stations.length, 0)
    return stats
  }, { cities: 0, lines: 0, stations: 0 })
}

function buildCatalog(cities) {
  return cities.map(city => ({
    id: city.id,
    name: city.name,
    cityname: city.cityname,
    lineCount: city.lines.length,
    stationCount: city.lines.reduce((total, line) => total + line.stations.length, 0),
  }))
}

/** 同名换乘站按城市聚合，避免搜索结果重复；首条线路用于取色与定位 */
function buildSearchIndex(cities) {
  const index = new Map()

  for (const city of cities) {
    for (const line of city.lines) {
      for (const station of line.stations) {
        const key = `${city.id}|${station.name}`
        let hit = index.get(key)

        if (!hit) {
          hit = {
            name: station.name,
            cityId: city.id,
            lineId: line.id,
            stationId: station.id,
            color: line.color,
            lines: [],
          }
          index.set(key, hit)
        }

        if (!hit.lines.includes(line.name))
          hit.lines.push(line.name)
      }
    }
  }

  return [...index.values()]
}

async function cleanStaleCities(validIds) {
  let entries = []
  try {
    entries = await readdir(CITIES_DIR)
  }
  catch {}

  await Promise.all(entries
    .filter(file => file.endsWith('.json') && !validIds.has(path.basename(file, '.json')))
    .map(file => rm(path.join(CITIES_DIR, file))))
}

async function writeJson(file, value, pretty = false) {
  await writeFile(file, `${JSON.stringify(value, null, pretty ? 2 : 0)}\n`)
}

async function main() {
  const source = await readFile(SOURCE, 'utf8')
  const cities = JSON.parse(source)
  const sourceStat = await stat(SOURCE)

  await mkdir(CITIES_DIR, { recursive: true })

  await Promise.all(cities.map(city =>
    writeJson(path.join(CITIES_DIR, `${city.id}.json`), city),
  ))

  const ids = new Set(cities.map(city => city.id))
  await cleanStaleCities(ids)

  const catalog = buildCatalog(cities)
  const search = buildSearchIndex(cities)
  const counts = countStats(cities)
  const version = createHash('sha256').update(source).digest('hex').slice(0, 12)

  const manifest = {
    version,
    updatedAt: sourceStat.mtime.toISOString(),
    counts,
    defaultCityIds: DEFAULT_CITY_IDS.filter(id => ids.has(id)),
  }

  await writeJson(path.join(OUTPUT_DIR, 'cities.json'), catalog)
  await writeJson(path.join(OUTPUT_DIR, 'search.json'), search)
  await writeJson(path.join(OUTPUT_DIR, 'manifest.json'), manifest, true)

  console.log(`数据构建完成: ${counts.cities} 城 / ${counts.lines} 线 / ${counts.stations} 站`)
  console.log(`版本 ${version} · 城市目录 ${catalog.length} 条 · 搜索索引 ${search.length} 条`)
  console.log(`输出目录 ${path.relative(ROOT, OUTPUT_DIR)}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
