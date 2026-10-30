<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { Motion, Presence } from '@oku-ui/motion'
import { useInteractorStore } from '~/stores/interactor.store'
import type { Station } from '~/types'

const emits = defineEmits<{
  (e: 'station-click', station: Station): void
}>()

const { focusedLine } = storeToRefs(useInteractorStore())
</script>

<template>
  <Presence>
    <Motion
      v-if="!!focusedLine"
      :key="focusedLine.id" :initial="{ opacity: 0, x: 50 }" :animate="{ opacity: 1, x: 0 }" :exit="{ opacity: 0, x: 50 }"
      class="fixed right-4 top-4 backdrop-blur-lg bg-white py-4 pb-0 rounded-lg min-w-[70px] z-[2]"
    >
      <h3 class="text-center text-xs text-zinc-700">
        {{ focusedLine.name }}
      </h3>
      <div class="max-h-[80vh] overflow-y-scroll scrollbar-none">
        <ul class="mt-3 text-xs text-stone-500 my-2 px-1">
          <li
            v-for="(station, idx) in focusedLine.stations" :key="station.id"
            class="hover:bg-zinc-100 rounded p-1.5 cursor-pointer" @click="() => {
              emits('station-click', station)
            }"
          >
            <span class="inline-block w-2 text-right mr-2" :style="{ color: `rgb(${focusedLine.color.slice(0, 3)})` }">
              {{ idx + 1 }}
            </span>
            {{ station.name }}
          </li>
        </ul>
      </div>
    </Motion>
  </Presence>
</template>
