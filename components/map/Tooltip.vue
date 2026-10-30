<script lang="ts" setup>
import { storeToRefs } from 'pinia'
import { useInteractorStore } from '~/stores/interactor.store'

const { hoveringPosition, hoveringLine, hoveringStation } = storeToRefs(useInteractorStore())
</script>

<template>
  <div v-if="hoveringLine && hoveringPosition.x > 0" class="fixed left-0 top-0 will-change-transform z-10 text-xs bg-white/90 p-1 rounded-lg" :style="{ transform: `translate(${hoveringPosition.x + 10}px, ${hoveringPosition.y + 10}px)` }">
    {{ hoveringLine.name }} <span class="font-semibold">
      {{ hoveringStation ? `/ ${hoveringStation.name}` : '' }}
    </span>
  </div>
</template>
