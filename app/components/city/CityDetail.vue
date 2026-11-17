<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { X } from 'lucide-vue-next'
import { Motion, Presence } from '@oku-ui/motion'
import { useAppStore } from '~/stores/app.store'
import type { Line } from '~/types'
import { useInteractorStore } from '~/stores/interactor.store'

const emits = defineEmits<{
  (e: 'line-select', line: Line): void
  (e: 'close',): void
}>()

const store = useAppStore()
const { detailCity } = storeToRefs(store)
const { setFocusedLine, setHoveringLine } = useInteractorStore()
</script>

<template>
  <Presence>
    <Motion
      v-if="detailCity"
      :initial="{ opacity: 0.95, y: -50 }"
      :animate="{ opacity: 1, y: 0 }"
      :exit="{ opacity: 0, y: -50 }"
      class="bg-white text-xs rounded-lg flex flex-col overflow-hidden max-h-[calc(100vh-2rem)]"
    >
      <h3 class="relative flex items-center justify-center shrink-0 px-2 pt-2 pb-2">
        <span>{{ detailCity.name }}</span>
        <X class="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer hover:scale-110" :size="12" @click="() => emits('close')" />
      </h3>
      <ul class="text-zinc-600 space-y-1 px-2 pb-2 overflow-y-auto overscroll-contain">
        <li
          v-for="line in detailCity.lines" :key="line.id" class="relative" @click="() => {
            emits('line-select', line)
            setFocusedLine(line)
          }" @mouseenter="() => setHoveringLine(line)" @mouseleave="() => setHoveringLine(null)"
        >
          <div class="hover:bg-zinc-50 rounded px-2 py-1 flex items-center cursor-pointer whitespace-nowrap">
            <div class="h-1 w-1 rounded-full mr-1 shrink-0" :style="{ background: `rgb(${line.color.slice(0, 3)})` }" />
            <span>{{ line.name }}</span>
            <span class="ml-auto pl-2 text-zinc-400 shrink-0 tabular-nums">{{ line.stations.length }}站</span>
          </div>
        </li>
      </ul>
    </Motion>
  </Presence>
</template>
