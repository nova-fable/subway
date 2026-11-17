#!/usr/bin/env node
/**
 * 从高德地图「地铁图」抓取全国最新地铁线路/站点数据，生成 pipeline/raw/data.json
 *
 * 数据源: https://map.amap.com/subway/index.html
 * 接口:
 *   - 城市列表  GET /service/subway?_=<ts>&srhdata=citylist.json
 *   - 城市线路  GET /service/subway?_=<ts>&srhdata=<adcode>_drw_<spell>.json
 *
 * 说明:
 *   - 坐标为 GCJ02 火星坐标系，渲染时由 useDataset 通过 gcoord 转为 WGS84
 *   - 支线在高德数据中表现为同名多条线路记录（li 以 | 分隔多个子线路 id），保持原样
 *   - 线路 id 取 li 的第一段；站点顺序即线路走向，polyline 由站点坐标连线生成
 *
 * 用法:
 *   pnpm data:fetch               # 抓取全部城市并重建 data/
 *   pnpm data:fetch:city 4401     # 仅抓取单城原始数据，保存到 pipeline/raw/cities/
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildData } from './build-data.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const CACHE_DIR = path.join(__dirname, '.cache')
const OUTPUT = path.join(__dirname, 'raw/data.json')
const RAW_CITIES_DIR = path.join(__dirname, 'raw/cities')

function envNumber(name, fallback) {
  const value = Number(process.env[name])
  return Number.isFinite(value) ? value : fallback
}

const ENDPOINT = 'https://map.amap.com/service/subway'
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Referer: 'https://map.amap.com/subway/index.html',
}
const FETCH_CONCURRENCY = Math.max(1, envNumber('AMAP_CONCURRENCY', 2))
const REQUEST_INTERVAL_MS = Math.max(0, envNumber('AMAP_REQUEST_INTERVAL_MS', 500))
const REQUEST_TIMEOUT_MS = Math.max(1000, envNumber('AMAP_REQUEST_TIMEOUT_MS', 30000))

let lastRequestAt = 0

async function waitForRequestSlot() {
  const wait = lastRequestAt + REQUEST_INTERVAL_MS - Date.now()
  if (wait > 0)
    await new Promise(resolve => setTimeout(resolve, wait))
  lastRequestAt = Date.now()
}

/** 城市显示名的精简规则（长后缀去除，特殊政区简称化） */
const CITY_NAME_SHORT = {
  '湘西土家族苗族自治州': '湘西',
}

function shortCityName(name) {
  return CITY_NAME_SHORT[name]
    ?? name.replace(/特别行政区$/, '').replace(/市$/, '')
}

/** 并发限制地顺序执行异步任务 */
async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length)
  let next = 0

  async function runOne() {
    while (next < items.length) {
      const index = next++
      results[index] = await worker(items[index], index)
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, runOne))
  return results
}

async function fetchSubwayData(srhdata, retries = 3) {
  const url = `${ENDPOINT}?_${Date.now()}&srhdata=${encodeURIComponent(srhdata)}`

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await waitForRequestSlot()
      const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
      if (!res.ok)
        throw new Error(`HTTP ${res.status}`)
      const text = await res.text()
      try {
        return JSON.parse(text)
      }
      catch {
        throw new Error(`响应不是合法 JSON: ${text.slice(0, 80)}`)
      }
    }
    catch (err) {
      if (attempt === retries)
        throw new Error(`抓取 ${srhdata} 失败（已重试 ${retries} 次）: ${err.message}`)
      await new Promise(r => setTimeout(r, attempt * 1500 + Math.random() * 800))
    }
  }
}

/** 把站点坐标序列编码为 data.json 的 polyline 格式：起点绝对值 [lat,lng]，之后为相对前点的 1e6 倍整数增量 */
function encodePolyline(points) {
  const coords = [points[0][0], points[0][1]]
  for (let i = 1; i < points.length; i++) {
    coords.push(Math.round((points[i][0] - points[i - 1][0]) * 1e6))
    coords.push(Math.round((points[i][1] - points[i - 1][1]) * 1e6))
  }
  return coords
}

function transformLine(cityId, rawLine, warnings) {
  const id = (rawLine.li || rawLine.ls || '').split('|')[0]
  if (!id) {
    warnings.push(`[${cityId}] 线路 ${rawLine.ln} 缺少线路 id，已跳过`)
    return null
  }

  const stations = (rawLine.st || [])
    .filter((s) => {
      if (s.sl && s.sl.includes(','))
        return true
      warnings.push(`[${cityId}] ${rawLine.ln} 站点 ${s.n} 缺少坐标，已跳过`)
      return false
    })
    .map((s) => {
      const [lng, lat] = s.sl.split(',').map(Number)
      return { id: String(s.si || s.sid), name: s.n, lat, lng }
    })

  if (stations.length < 2) {
    warnings.push(`[${cityId}] 线路 ${rawLine.ln} 仅 ${stations.length} 个有效站点，已跳过`)
    return null
  }

  const points = stations.map(s => [s.lat, s.lng])
  return {
    id,
    name: rawLine.ln,
    color: (rawLine.cl || '000000').toUpperCase(),
    stations,
    polyline: encodePolyline(points),
    fullPolyline: points.map(([lat, lng]) => [lng, lat]),
  }
}

function transformCity(raw, city) {
  const warnings = []
  const lines = []
  const seenLineIds = new Set()

  for (const rawLine of raw.l || []) {
    const line = transformLine(raw.i, rawLine, warnings)
    if (!line)
      continue
    // 同一城市内支线记录的 li 首段偶有重复，重复时以第一条为准
    if (seenLineIds.has(line.id)) {
      warnings.push(`[${raw.i}] 线路 id ${line.id}(${line.name}) 重复，已合并为一条`)
      continue
    }
    seenLineIds.add(line.id)
    lines.push(line)
  }

  return {
    city: {
      id: raw.i,
      name: shortCityName(city.cityname),
      cityname: city.spell,
      lines,
    },
    warnings,
  }
}

function validate(cities) {
  const problems = []
  const totalLines = cities.reduce((n, c) => n + c.lines.length, 0)
  const totalStations = cities.reduce((n, c) => n + c.lines.reduce((m, l) => m + l.stations.length, 0), 0)

  for (const city of cities) {
    if (city.lines.length === 0)
      problems.push(`城市 ${city.name} 没有任何线路`)
    for (const line of city.lines) {
      if (!/^[0-9A-F]{6}$/.test(line.color))
        problems.push(`${city.name} ${line.name} 颜色异常: ${line.color}`)
      if (line.polyline.length !== line.fullPolyline.length * 2)
        problems.push(`${city.name} ${line.name} polyline 长度不一致`)
      for (const s of line.stations) {
        // 中国（含港澳台）大致经纬度范围
        if (s.lat < 17 || s.lat > 55 || s.lng < 72 || s.lng > 136)
          problems.push(`${city.name} ${line.name} 站点 ${s.name} 坐标越界: ${s.lat},${s.lng}`)
        if (!s.name)
          problems.push(`${city.name} ${line.name} 存在无名站点`)
      }
    }
  }

  return { totalLines, totalStations, problems }
}

/** 与旧数据对比，输出规模变化与新旧共有线路的站点数异常波动 */
function diffWithOld(oldCities, newCities) {
  const oldById = new Map(oldCities.map(c => [c.id, c]))
  const added = newCities.filter(c => !oldById.has(c.id))
  const removed = oldCities.filter(c => !newCities.some(nc => nc.id === c.id))

  console.log(`\n新增城市 (${added.length}): ${added.map(c => c.name).join('、') || '无'}`)
  if (removed.length)
    console.log(`移除城市 (${removed.length}): ${removed.map(c => c.name).join('、')}`)

  const lines = []
  for (const city of newCities) {
    const old = oldById.get(city.id)
    if (!old)
      continue
    const oldStations = old.lines.reduce((n, l) => n + l.stations.length, 0)
    const newStations = city.lines.reduce((n, l) => n + l.stations.length, 0)
    const oldLines = old.lines.length
    const newLines = city.lines.length
    if (oldLines !== newLines || oldStations !== newStations)
      lines.push(`  ${city.name}: 线路 ${oldLines}→${newLines}, 站点 ${oldStations}→${newStations}`)
  }
  console.log(`\n规模变化的城市 (${lines.length}):`)
  console.log(lines.join('\n') || '  无')
}

function printFields(label, value) {
  console.log(`\n${label}:`)
  for (const [key, field] of Object.entries(value ?? {})) {
    const text = typeof field === 'string' ? field : JSON.stringify(field)
    console.log(`  ${key}: ${text.length > 120 ? `${text.slice(0, 120)}…` : text}`)
  }
}

async function fetchSingleCity(query) {
  console.log('抓取城市列表...')
  const citylist = (await fetchSubwayData('citylist.json')).citylist
  const normalized = query.toLowerCase()
  const city = citylist.find(item => item.adcode === query)
    ?? citylist.find(item => item.spell.toLowerCase() === normalized)
    ?? citylist.find(item => item.cityname.includes(query))
    ?? citylist.find(item => shortCityName(item.cityname) === query)

  if (!city)
    throw new Error(`未找到城市: ${query}`)

  const srhdata = `${city.adcode}_drw_${city.spell}.json`
  console.log(`抓取 ${city.cityname}（${srhdata}）...`)
  const raw = await fetchSubwayData(srhdata)

  await mkdir(RAW_CITIES_DIR, { recursive: true })
  const file = path.join(RAW_CITIES_DIR, `${city.adcode}.json`)
  await writeFile(file, `${JSON.stringify(raw, null, 2)}\n`)

  const { city: transformed, warnings } = transformCity(raw, city)
  const totalStations = transformed.lines.reduce((n, line) => n + line.stations.length, 0)

  console.log(`\n===== ${transformed.name} 原始数据 =====`)
  console.log(`顶层字段: ${Object.keys(raw).join(', ')}`)
  console.log(`线路: ${transformed.lines.length} 条，站点记录: ${totalStations} 个`)
  printFields('首条线路字段', raw.l?.[0])
  printFields('首个站点字段', raw.l?.[0]?.st?.[0])

  if (warnings.length) {
    console.log(`\n警告 (${warnings.length}):`)
    warnings.forEach(w => console.log(`  - ${w}`))
  }

  console.log(`\n原始 JSON: ${path.relative(ROOT, file)}`)
}

async function main() {
  const args = process.argv.slice(2)
  const cityFlagIndex = args.indexOf('--city')

  if (cityFlagIndex >= 0) {
    const query = args[cityFlagIndex + 1]
    if (!query)
      throw new Error('用法: pnpm data:fetch:city <adcode|城市名|拼音>')
    await fetchSingleCity(query)
    return
  }

  const started = Date.now()
  await mkdir(CACHE_DIR, { recursive: true })

  console.log(`请求策略: 并发 ${FETCH_CONCURRENCY}，全局间隔 ${REQUEST_INTERVAL_MS}ms（最多约 ${(1000 / Math.max(REQUEST_INTERVAL_MS, 1)).toFixed(1)} 次/秒）`)
  console.log('抓取城市列表...')
  const citylist = (await fetchSubwayData('citylist.json')).citylist
  console.log(`共 ${citylist.length} 个城市`)

  // 尽量沿用旧数据的城市排序（热门城市靠前），新城市按高德顺序追加
  let oldCities = []
  try {
    oldCities = JSON.parse(await readFile(OUTPUT, 'utf8'))
  }
  catch {
    console.warn('读取旧 data.json 失败，将使用高德默认顺序')
  }
  const oldOrder = new Map(oldCities.map((c, i) => [c.id, i]))
  const orderedCitylist = [...citylist].sort(
    (a, b) => (oldOrder.get(a.adcode) ?? 1e9) - (oldOrder.get(b.adcode) ?? 1e9),
  )

  const allWarnings = []
  let done = 0

  const cities = (await mapWithConcurrency(orderedCitylist, FETCH_CONCURRENCY, async (city) => {
    const srhdata = `${city.adcode}_drw_${city.spell}.json`
    const raw = await fetchSubwayData(srhdata)
    await writeFile(path.join(CACHE_DIR, srhdata), JSON.stringify(raw))
    const { city: transformed, warnings } = transformCity(raw, city)
    allWarnings.push(...warnings)
    done++
    process.stdout.write(`\r[${done}/${citylist.length}] ${transformed.name}: ${transformed.lines.length} 条线路`)
    return transformed
  })).sort((a, b) =>
    (oldOrder.get(a.id) ?? 1e9) - (oldOrder.get(b.id) ?? 1e9),
  )

  const { totalLines, totalStations, problems } = validate(cities)

  console.log(`\n\n===== 抓取结果 =====`)
  console.log(`城市: ${cities.length}, 线路: ${totalLines}, 站点: ${totalStations}`)
  console.log(`耗时: ${((Date.now() - started) / 1000).toFixed(1)}s`)

  if (allWarnings.length) {
    console.log(`\n警告 (${allWarnings.length}):`)
    allWarnings.forEach(w => console.log(`  - ${w}`))
  }
  if (problems.length) {
    console.error(`\n校验失败 (${problems.length}):`)
    problems.forEach(p => console.error(`  - ${p}`))
    process.exitCode = 1
  }

  diffWithOld(oldCities, cities)

  await writeFile(OUTPUT, `${JSON.stringify(cities, null, 2)}\n`)
  console.log(`\n已写入 ${path.relative(ROOT, OUTPUT)}`)

  await buildData()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
