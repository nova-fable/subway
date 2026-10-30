import { acceptHMRUpdate, defineStore } from 'pinia'
import type { Line, Station } from '~/types'

interface Position {
  x: number
  y: number
}

export const useInteractorStore = defineStore('interactor', () => {
  const focusedLine = ref<Line | null> (null)
  const hoveringLine = ref<Line | null>(null)
  const hoveringStation = ref<Station | null>(null)
  const hoveringPosition = ref<Position >({ x: -1, y: -1 })

  const setFocusedLine = (line: Line | null) => {
    focusedLine.value = line
    hoveringLine.value = null
    hoveringStation.value = null
  }

  const setHoveringLine = (line: Line | null) => {
    if (focusedLine.value)
      return
    hoveringLine.value = line
  }

  const setHoveringStation = (station: Station | null, line: Line | null) => {
    if (focusedLine.value)
      return
    hoveringStation.value = station
    station && (hoveringLine.value = line)
  }
  const setHoveringPosition = (position: Position) => {
    hoveringPosition.value = position
  }

  const reset = () => {
    focusedLine.value = null
    hoveringLine.value = null
    hoveringStation.value = null
    hoveringPosition.value = { x: -1, y: -1 }
  }

  return {
    focusedLine,
    hoveringLine,
    hoveringStation,
    hoveringPosition,

    setFocusedLine,
    setHoveringLine,
    setHoveringStation,
    setHoveringPosition,
    reset,
  }
})

if (import.meta.hot)
  import.meta.hot.accept(acceptHMRUpdate(useInteractorStore, import.meta.hot))
