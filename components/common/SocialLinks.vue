<script setup lang="ts">
import { Github } from 'lucide-vue-next'
</script>

<template>
  <header class="flex justify-center items-center gap-2 pb-2 mb-2 border-b border-zinc-100">
    <a
      href="https://github.com/nova-fable/subway"
      target="_blank"
      rel="noopener noreferrer"
      class="text-zinc-400 hover:text-zinc-600 transition-colors p-1 rounded hover:bg-zinc-50"
      title="GitHub"
    >
      <Github :size="14" />
    </a>
  </header>
</template>
