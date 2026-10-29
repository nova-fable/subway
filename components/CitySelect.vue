<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { List, MapPin, MapPinOff, Search } from 'lucide-vue-next'
import { useAppStore } from '~/store/app.store'
import type { City, Line, Station } from '~/types'

interface StationHit {
  station: Station
  line: Line
  city: City
  lines: string[]
}

const emits = defineEmits<{
  (e: 'city-select', city: City): void
  (e: 'city-unselect', city: City): void
  (e: 'on-zoom', city: City): void
  (e: 'stationSelect', hit: StationHit): void
}>()

const store = useAppStore()
const { isCitySelected, toggleCity, setDetailCity, isCityPinned, isCityActive, setActiveCity } = store
const { dataset, selectedCities } = storeToRefs(store)
const isOpen = ref(true)

watchEffect(() => {
  if (selectedCities.value.size === 0)
    isOpen.value = true
})

const searchQuery = ref('')

/**
 * 按站名搜索，同名换乘站按城市聚合展示所属线路
 */
const stationHits = computed<StationHit[]>(() => {
  const query = searchQuery.value.trim()
  if (query.length < 2)
    return []

  const byKey = new Map<string, StationHit>()
  for (const city of dataset.value) {
    for (const line of city.lines) {
      for (const station of line.stations) {
        if (!station.name.includes(query))
          continue
        const key = `${city.id}-${station.name}`
        const hit = byKey.get(key)
        if (hit)
          hit.lines.push(line.name)
        else
          byKey.set(key, { station, line, city, lines: [line.name] })
      }
    }
  }
  return [...byKey.values()].slice(0, 8)
})

function selectStation(hit: StationHit) {
  searchQuery.value = ''
  setActiveCity(hit.city)
  emits('stationSelect', hit)
}

const totalLines = computed(() => dataset.value.reduce((n, city) => n + city.lines.length, 0))
const totalStations = computed(() => dataset.value.reduce((n, city) => n + city.lines.reduce((m, line) => m + line.stations.length, 0), 0))

const config = useRuntimeConfig()
const updatedAt = computed(() => {
  const time = new Date(config.public.DATA_UPDATED_AT as unknown as string)
  return Number.isNaN(time.getTime()) ? '' : `数据更新于 ${time.toISOString().slice(0, 10)}`
})
</script>

<template>
  <div class=" bg-white rounded text-zinc-800 text-xs p-2 pb-2 flex flex-col flex-1 max-h-full">
    <SocialLinks />

    <div class="relative mb-1">
      <input
        v-model="searchQuery"
        placeholder="搜索地铁站，如 国贸"
        class="w-full bg-zinc-100 rounded px-2 py-1 pr-6 text-xs text-zinc-600 placeholder:text-zinc-300 outline-none focus:bg-zinc-50"
        @keydown.enter.prevent="stationHits[0] && selectStation(stationHits[0])"
      >
      <Search class="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-300" :size="12" />

      <ul
        v-if="stationHits.length"
        class="absolute z-10 left-0 right-0 mt-1 bg-white rounded shadow-lg border border-zinc-100 overflow-hidden"
      >
        <li
          v-for="hit in stationHits" :key="`${hit.city.id}-${hit.station.name}`"
          class="px-2 py-1 flex items-center gap-1 cursor-pointer hover:bg-zinc-50"
          @mousedown.prevent="() => selectStation(hit)"
        >
          <span class="h-1.5 w-1.5 rounded-full shrink-0" :style="{ background: `rgb(${hit.line.color.slice(0, 3)})` }" />
          <span class="text-zinc-700">{{ hit.station.name }}</span>
          <span class="text-zinc-400 truncate">{{ hit.city.name }} · {{ hit.lines.join('/') }}</span>
        </li>
      </ul>
    </div>

    <section class="grow overflow-scroll scrollbar-none" :class="!isOpen && `max-h-0`">
      <ul class="select-none">
        <li
          v-for="city in dataset" :key="city.id"
          class="group text-xs text-zinc-400 p-1 flex items-center cursor-pointer hover:bg-zinc-100 rounded hover:text-zinc-500"
          @click="() => {
            setActiveCity(city)
            emits('city-select', city)
          }"
        >
          <span>

            {{ city.name }}
          </span>
          <span class="flex ml-auto space-x-1 items-center opacity-0 pointer-events-none" :class="isCitySelected(city) && 'opacity-100 pointer-events-auto'">
            <span
              class="p-0.5 cursor-pointer" @click.stop="() => {
                setDetailCity(city)
              }"
            >
              <List class="hover:scale-125" :size="12" />
            </span>
            <span
              class="cursor-pointer" @click.stop="() => {
                toggleCity(city)
                emits('city-unselect', city)
              }"
            >
              <MapPin v-if="isCityActive(city)" class="text-blue-500 hover:scale-125 transition-transform" :size="12" />
              <MapPinOff v-else-if="isCityPinned(city)" class="text-red-500 hover:scale-125 transition-transform" :size="12" />
            </span>
          </span>
        </li>
      </ul>
    </section>

    <footer class="pt-1.5 mt-1 border-t border-zinc-100 flex justify-between items-center text-[10px] text-zinc-400 select-none">
      <span>{{ dataset.length }} 城 · {{ totalLines }} 线 · {{ totalStations }} 站</span>
      <span v-if="updatedAt">{{ updatedAt }}</span>
    </footer>
  </div>
</template>
