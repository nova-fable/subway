# 🚇 中国城市地铁可视化

<div align="center">
  <img src="./preview.png" alt="地铁可视化预览" width="800">
</div>

<h2 align="center">
基于 Vue3 和 Deck.gl 的中国城市地铁可视化应用
</h2><br>

<pre align="center">
🚇 数据截止：2026年11月 · 58 城 · 401 线 · 8568 站
</pre>

## 项目简介

这是一个展示中国城市地铁线路的可视化应用，使用现代 Web 技术栈构建，提供交互式的地铁网络浏览体验。

## 功能特性

- 🗺️ **全国地铁网络**：覆盖中国内地及港澳台全部已开通轨道交通的城市，含地铁、轻轨、市域铁路、磁浮、云巴等制式
- 🔍 **站点搜索**：按站名跨城市搜索，一键定位到车站
- 📌 **城市收藏**：钉住多个城市对比查看，点击城市/线路自动缩放
- 🚉 **线路详情**：聚焦单条线路，展示沿线全部车站
- 📊 **数据统计**：侧栏底部展示全国城市/线路/站点规模与数据更新时间

## 技术栈

### 核心技术

- **前端框架**: Vue 3 + Nuxt 3
- **可视化**: Deck.gl
- **状态管理**: Pinia
- **类型检查**: TypeScript
- **构建工具**: Vite


## 项目结构

```text
app/        运行时源码（Nuxt srcDir：组件、页面、store、图层、类型）
data/       构建后的数据集（城市目录、搜索索引、按城市分片）
pipeline/   数据抓取与构建脚本（原始数据在 pipeline/raw）
public/     静态资源
```

## 数据说明

- 📊 **数据来源**: [高德地图地铁图](https://map.amap.com/subway)（GCJ02 坐标系，渲染时转换为 WGS84）
- 📅 **数据时间**: 截止至 2026年11月
- 🏙️ **覆盖城市**: 58 个，包括北京、上海、广州、深圳等主要城市，以及台北、高雄、桃园、台中、香港、澳门等港澳台城市
- 📈 **数据规模**: 401 条线路、8568 个站点记录
- 🔁 **支线处理**: 支线以同名多条线路记录表示（如上海 11 号线主线/花桥段各一条）

### 抓取频率

脚本默认采用保守的请求节奏，请勿把间隔调低或盲目提高并发：

| 数据源 | 策略 | 默认值 | 可调环境变量 |
| --- | --- | --- | --- |
| 高德地铁图 | 并发 + 全局最小间隔 | 并发 2，全局每 500ms 最多发起 1 次请求（约 2 次/秒） | `AMAP_CONCURRENCY`、`AMAP_REQUEST_INTERVAL_MS`、`AMAP_REQUEST_TIMEOUT_MS` |
| OSM Overpass | 串行 + 最小间隔 | 每 1.5s 最多发起 1 次请求；命中缓存不发请求 | `OVERPASS_REQUEST_INTERVAL_MS`、`OVERPASS_URL` |

- 全量高德抓取共 59 次请求（1 次城市列表 + 58 个城市），约 30 秒完成。
- OSM 请求按城市串行，结果缓存在 `pipeline/.cache/osm/`（已忽略提交），重复执行不会重复请求；遇到 `429` 会读取 `Retry-After`，失败按 3 秒、6 秒退避重试。
- 单城抓取仅产生 2 次高德请求。

### 查看单城原始数据

```bash
pnpm data:fetch:city 4401        # adcode
pnpm data:fetch:city 广州
pnpm data:fetch:city guangzhou
```

原始响应保存到 `pipeline/raw/cities/{adcode}.json`（已忽略提交），并在终端打印字段概览。主要字段如下：

| 层级 | 字段 | 含义 |
| --- | --- | --- |
| 顶层 | `s` / `i` / `o` / `l` | 城市地铁名称 / 城市 adcode / 地图内部参数 / 线路数组 |
| 线路 | `ln` / `kn` / `cl` | 线路简称 / 线路全名 / 线路颜色（6 位十六进制） |
| 线路 | `li` / `ls` / `st` | 线路 id 组合 / 起始站 id / 站点数组 |
| 线路 | `c` / `f` / `lo` / `lp` | 地图绘制坐标，脚本不使用 |
| 站点 | `n` / `si` / `sl` / `sp` | 站名 / 站点 id / GCJ02 经纬度 `lng,lat` / 拼音 |
| 站点 | `r` / `udli` / `udsi` | 换乘与相邻线路关系 |
| 站点 | `p` / `rs` / `udpx` | 地图像素坐标，脚本不使用 |
| 站点 | `lg` / `poiid` / `multilang` | 地图内部编号 / POI id / 多语言名称 |

### 更新数据

数据由脚本从高德地铁图实时抓取生成，线路开通后重新执行即可更新：

```bash
pnpm data:fetch
```

会先写入 `pipeline/raw/data.json`，再自动构建 `data/`。随后可用 OSM 真实线路几何覆盖直线连接：

```bash
pnpm data:osm

# 仅处理指定城市（匹配城市名或 adcode），完成后自动构建
pnpm data:osm -- --cities=深圳,广州
pnpm data:osm -- --cities=桃园 --force
```

如只需重新切分已有原始数据：

```bash
pnpm data:build
```

产物位于 `data/`：`manifest.json`（版本与统计）、`cities.json`（城市目录）、`search.json`（站点搜索索引）、`cities/{adcode}.json`（单城线路与站点）。前端首屏只加载城市目录与默认城市，其余城市在选中时按需请求。

## 部署

站点通过 GitHub Actions 构建静态产物并发布到 GitHub Pages，自定义域名为 `subway.zxinrun.cn`。

- 工作流：`.github/workflows/deploy-pages.yml`，推送 `main` 或手动触发后执行 `pnpm generate` 并部署 `.output/public`
- 仓库 Settings → Pages → Source 选择 **GitHub Actions**
- 域名：`public/CNAME` 固定为 `subway.zxinrun.cn`；DNS 的 `subway` 记录需 CNAME 到 `<仓库所有者>.github.io`（本仓库为 `nova-fable.github.io`）
- 地图样式可通过仓库 Settings → Secrets and variables → Actions → Variables 配置 `MAP_URL` 覆盖，默认使用 CARTO Positron

## 许可证

MIT License
