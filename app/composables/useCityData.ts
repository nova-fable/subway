import type { CityMeta, DataManifest, RawCity, SearchEntry } from '~/types'

const BASE_URL = '/data'

let manifestPromise: Promise<DataManifest> | undefined
let catalogPromise: Promise<CityMeta[]> | undefined
let searchPromise: Promise<SearchEntry[]> | undefined
const cityPromises = new Map<string, Promise<RawCity>>()

function request<T>(file: string) {
  return $fetch<T>(`${BASE_URL}/${file}`)
}

export function loadManifest() {
  return (manifestPromise ??= request<DataManifest>('manifest.json'))
}

export function loadCatalog() {
  return (catalogPromise ??= request<CityMeta[]>('cities.json'))
}

export function loadSearchIndex() {
  return (searchPromise ??= request<SearchEntry[]>('search.json'))
}

export function loadRawCity(id: string) {
  let promise = cityPromises.get(id)
  if (!promise) {
    promise = request<RawCity>(`cities/${id}.json`).catch((error) => {
      cityPromises.delete(id)
      throw error
    })
    cityPromises.set(id, promise)
  }
  return promise
}
