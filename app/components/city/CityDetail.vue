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
      class="bg-white text-xs p-2 rounded-lg"
    >
      <h3 class="flex items-center">
        <span>{{ detailCity.name }}</span>
        <X class="ml-auto cursor-pointer hover:scale-110" :size="12" @click="() => emits('close')" />
      </h3>
      <ul class="text-zinc-600 space-y-1 mt-2">
        <li
          v-for="line in detailCity.lines" :key="line.id" class="relative" @click="() => {
            emits('line-select', line)
            setFocusedLine(line)
          }" @mouseenter="() => setHoveringLine(line)" @mouseleave="() => setHoveringLine(null)"
        >
          <div class="hover:bg-zinc-50 rounded px-2 py-1 flex items-center cursor-pointer">
            <div class="h-1 w-1 rounded-full mr-1" :style="{ background: `rgb(${line.color.slice(0, 3)})` }" />
            {{ line.name }}
          </div>
        </li>
      </ul>
    </Motion>
  </Presence>
</template>
