import { acceptHMRUpdate, defineStore } from 'pinia'
import { useInteractorStore } from './interactor.store'
import type { City } from '~/types'

export const useAppStore = defineStore('app', () => {
  const dataset = useDataset()

  const pinnedCities = ref<Set<City>>(new Set())
  const activeCities = ref<Set<City>>(new Set())
  const selectedCities = computed(() => {
    return new Set([...pinnedCities.value, ...activeCities.value])
  })

  const detailCity = ref<City | null>(null)

  // Initialize default selected cities
  const defaultCityIds = ['4401', '4403', '8100', '4419'] // Guangzhou, Shenzhen, Hong Kong, Dongguan

  // Set default cities when dataset is loaded
  nextTick(() => {
    defaultCityIds.forEach((cityId) => {
      const city = dataset.value.find(c => c.id === cityId)
      if (city)
        activeCities.value.add(city)
    })
  })

  const isCityPinned = (city: City) => pinnedCities.value.has(city)
  const isCityActive = (city: City) => activeCities.value.has(city)
  const isCitySelected = (city: City) => isCityPinned(city) || isCityActive(city)

  const setAsOnlyActiveCity = (city: City) => {
    activeCities.value.clear()
    activeCities.value.add(city)
  }

  const pinCity = (city: City) => {
    if (activeCities.value.has(city))
      activeCities.value.delete(city)

    pinnedCities.value.add(city)
  }

  const unpinCity = (city: City) => {
    pinnedCities.value.delete(city)
  }

  const toggleCity = (city: City) => {
    if (isCityPinned(city)) {
      unpinCity(city)
    }
    else if (isCityActive(city)) {
      pinCity(city)
    }
    else {
      setAsOnlyActiveCity(city)
      useInteractorStore().reset()
    }
  }

  const setActiveCity = (city: City) => {
    if (activeCities.value.has(city) && activeCities.value.size === 1)
      return

    setAsOnlyActiveCity(city)
    useInteractorStore().reset()
  }

  const setDetailCity = (city: City | null) =>
    detailCity.value = city

  return {
    dataset,
    selectedCities,
    detailCity,
    pinnedCities,
    activeCities,

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
