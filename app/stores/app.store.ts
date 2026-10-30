import { acceptHMRUpdate, defineStore } from 'pinia'
import { useInteractorStore } from './interactor.store'
import { loadCatalog, loadManifest, loadRawCity } from '~/composables/useCityData'
import type { City, CityMeta, DataManifest } from '~/types'
import { toCity } from '~/utils/dataset'

const DEFAULT_CITY_IDS = ['4401', '4403', '8100', '4419'] // Guangzhou, Shenzhen, Hong Kong, Dongguan

export const useAppStore = defineStore('app', () => {
  const manifest = ref<DataManifest | null>(null)
  const catalog = ref<CityMeta[]>([])
  const cities = ref<Map<string, City>>(new Map())
  const initialized = ref(false)

  const pinnedCityIds = ref<Set<string>>(new Set())
  const activeCityIds = ref<Set<string>>(new Set())
  const selectedCityIds = computed(() => new Set([...pinnedCityIds.value, ...activeCityIds.value]))
  const selectedCities = computed(() => [...selectedCityIds.value]
    .map(id => cities.value.get(id))
    .filter((city): city is City => !!city))
  const dataset = computed(() => catalog.value
    .map(meta => cities.value.get(meta.id))
    .filter((city): city is City => !!city))

  const detailCity = ref<City | null>(null)

  const pendingCities = new Map<string, Promise<City | null>>()
  let initPromise: Promise<void> | null = null

  const getCity = (id: string) => cities.value.get(id) ?? null

  const loadCity = (id: string): Promise<City | null> => {
    const city = cities.value.get(id)
    if (!city)
      return Promise.resolve(null)
    if (city.ready)
      return Promise.resolve(city)

    const pending = pendingCities.get(id)
    if (pending)
      return pending

    const promise = loadRawCity(id)
      .then((raw) => {
        // 保持占位对象引用不变，收藏/选中集合与组件无需感知对象替换
        Object.assign(city, toCity(raw))
        return city
      })
      .catch((error) => {
        console.error(`[city] 加载 ${id} 失败`, error)
        return null
      })
      .finally(() => pendingCities.delete(id))

    pendingCities.set(id, promise)
    return promise
  }

  const init = () => {
    if (initPromise)
      return initPromise

    initPromise = (async () => {
      const [dataManifest, cityCatalog] = await Promise.all([loadManifest(), loadCatalog()])
      manifest.value = dataManifest
      catalog.value = cityCatalog

      const map = new Map<string, City>()
      for (const meta of cityCatalog) {
        map.set(meta.id, {
          id: meta.id,
          name: meta.name,
          lines: [],
          bound: [[0, 0], [0, 0]],
          ready: false,
        })
      }
      cities.value = map

      const defaults = dataManifest.defaultCityIds.length ? dataManifest.defaultCityIds : DEFAULT_CITY_IDS
      for (const id of defaults) {
        if (map.has(id))
          activeCityIds.value.add(id)
      }

      await Promise.all(defaults.map(loadCity))
      initialized.value = true
    })().catch((error) => {
      initPromise = null
      throw error
    })

    return initPromise
  }

  const isCityPinned = (city: City) => pinnedCityIds.value.has(city.id)
  const isCityActive = (city: City) => activeCityIds.value.has(city.id)
  const isCitySelected = (city: City) => isCityPinned(city) || isCityActive(city)

  const setAsOnlyActiveCity = (city: City) => {
    activeCityIds.value = new Set([city.id])
  }

  const pinCity = async (city: City) => {
    if (activeCityIds.value.has(city.id)) {
      const next = new Set(activeCityIds.value)
      next.delete(city.id)
      activeCityIds.value = next
    }
    pinnedCityIds.value = new Set([...pinnedCityIds.value, city.id])
    await loadCity(city.id)
  }

  const unpinCity = (city: City) => {
    const next = new Set(pinnedCityIds.value)
    next.delete(city.id)
    pinnedCityIds.value = next
  }

  const toggleCity = async (city: City) => {
    if (isCityPinned(city)) {
      unpinCity(city)
      return
    }
    if (isCityActive(city)) {
      await pinCity(city)
      return
    }
    setAsOnlyActiveCity(city)
    useInteractorStore().reset()
    await loadCity(city.id)
  }

  const setActiveCity = async (city: City) => {
    if (activeCityIds.value.has(city.id) && activeCityIds.value.size === 1)
      return loadCity(city.id)

    setAsOnlyActiveCity(city)
    useInteractorStore().reset()
    return loadCity(city.id)
  }

  const setDetailCity = async (city: City | null) => {
    detailCity.value = city
    if (city)
      await loadCity(city.id)
  }

  return {
    manifest,
    catalog,
    dataset,
    selectedCities,
    selectedCityIds,
    detailCity,
    initialized,

    getCity,
    init,
    loadCity,
    isCityPinned,
    isCityActive,
    isCitySelected,
    toggleCity,
    setDetailCity,
    pinCity,
    unpinCity,
    setAsOnlyActiveCity,
    setActiveCity,
  }
})

if (import.meta.hot)
  import.meta.hot.accept(acceptHMRUpdate(useAppStore, import.meta.hot))
