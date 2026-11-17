<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { List, MapPin, MapPinOff, Search } from 'lucide-vue-next'
import { loadSearchIndex } from '~/composables/useCityData'
import { useAppStore } from '~/stores/app.store'
import type { City, Line, SearchEntry, Station } from '~/types'

interface SearchHit {
  entry: SearchEntry
  city: City
}

interface StationHit {
  station: Station
  line: Line
  city: City
  lines: string[]
}

const emits = defineEmits<{
  (e: 'citySelect', city: City): void
  (e: 'on-zoom', city: City): void
  (e: 'stationSelect', hit: StationHit): void
}>()

const store = useAppStore()
const { isCitySelected, toggleCity, setDetailCity, isCityPinned, isCityActive } = store
const { dataset, selectedCityIds } = storeToRefs(store)
const isOpen = ref(true)

watchEffect(() => {
  if (selectedCityIds.value.size === 0)
    isOpen.value = true
})

const searchQuery = ref('')
const searchIndex = ref<SearchEntry[]>([])
const searchLoading = ref(false)

watch(searchQuery, async (value) => {
  if (value.trim().length < 2 || searchIndex.value.length || searchLoading.value)
    return

  searchLoading.value = true
  try {
    searchIndex.value = await loadSearchIndex()
  }
  catch (error) {
    console.error('[search] 加载站点索引失败', error)
  }
  finally {
    searchLoading.value = false
  }
})

/**
 * 按站名搜索，索引已在构建期按城市聚合同名换乘站
 */
const stationHits = computed<SearchHit[]>(() => {
  const query = searchQuery.value.trim()
  if (query.length < 2 || !searchIndex.value.length)
    return []

  return searchIndex.value
    .filter(entry => entry.name.includes(query))
    .slice(0, 8)
    .map(entry => ({ entry, city: store.getCity(entry.cityId) }))
    .filter((hit): hit is SearchHit => !!hit.city)
})

async function selectStation(hit: SearchHit) {
  searchQuery.value = ''

  const city = await store.loadCity(hit.entry.cityId)
  if (!city)
    return

  const line = city.lines.find(item => item.id === hit.entry.lineId)
    ?? city.lines.find(item => item.name === hit.entry.lines[0])
  if (!line)
    return

  const station = line.stations.find(item => item.id === hit.entry.stationId)
    ?? line.stations.find(item => item.name === hit.entry.name)
  if (!station)
    return

  await store.setActiveCity(city)
  emits('stationSelect', { station, line, city, lines: hit.entry.lines })
}

async function selectCity(city: City) {
  const loaded = await store.setActiveCity(city)
  if (!loaded?.ready)
    return

  emits('citySelect', city)
}
</script>

<template>
  <div class="w-36 shrink-0 bg-white rounded text-zinc-800 text-xs p-2 pb-2 flex flex-col max-h-full">
    <SocialLinks />

    <div class="relative mb-1">
      <input
        v-model="searchQuery"
        placeholder="搜索站点，如国贸"
        class="w-full bg-zinc-100 rounded px-2 py-1 pr-6 text-xs text-zinc-600 placeholder:text-zinc-300 outline-none focus:bg-zinc-50"
        @keydown.enter.prevent="stationHits[0] && selectStation(stationHits[0])"
      >
      <Search class="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-300" :size="12" />

      <ul
        v-if="stationHits.length"
        class="absolute z-10 left-0 mt-1 bg-white rounded shadow-lg border border-zinc-100 overflow-hidden w-max min-w-full max-w-[calc(100vw-2rem)]"
      >
        <li
          v-for="hit in stationHits" :key="`${hit.city.id}-${hit.entry.name}`"
          class="px-2 py-1 flex items-center gap-1 cursor-pointer hover:bg-zinc-50 whitespace-nowrap"
          @mousedown.prevent="() => selectStation(hit)"
        >
          <span class="h-1.5 w-1.5 rounded-full shrink-0" :style="{ background: `#${hit.entry.color}` }" />
          <span class="text-zinc-700 shrink-0">{{ hit.entry.name }}</span>
          <span class="text-zinc-400 truncate">{{ hit.city.name }} · {{ hit.entry.lines.join('/') }}</span>
        </li>
      </ul>
    </div>

    <section class="grow overflow-scroll scrollbar-none" :class="!isOpen && `max-h-0`">
      <ul class="select-none">
        <li
          v-for="city in dataset" :key="city.id"
          class="group text-xs text-zinc-400 p-1 flex items-center cursor-pointer hover:bg-zinc-100 rounded hover:text-zinc-500"
          @click="() => selectCity(city)"
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
              }"
            >
              <MapPin v-if="isCityActive(city)" class="text-blue-500 hover:scale-125 transition-transform" :size="12" />
              <MapPinOff v-else-if="isCityPinned(city)" class="text-red-500 hover:scale-125 transition-transform" :size="12" />
            </span>
          </span>
        </li>
      </ul>
    </section>
  </div>
</template>
