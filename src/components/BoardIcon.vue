<script setup lang="ts">
import type { BoardIconName } from '../game/board'

defineProps<{ name: BoardIconName }>()
</script>

<template>
  <svg class="board-icon" viewBox="0 0 32 32" fill="none" aria-hidden="true">
    <g v-if="name === 'flag'">
      <path d="M8 27V5" />
      <path d="M9 6h15l-3.5 5L24 16H9" />
      <path d="M5 27h8" />
    </g>
    <g v-else-if="name === 'chart'">
      <path d="M5 26h23" />
      <rect x="7" y="17" width="4" height="9" rx="1" />
      <rect x="14" y="12" width="4" height="14" rx="1" />
      <rect x="21" y="7" width="4" height="19" rx="1" />
    </g>
    <g v-else-if="name === 'bulb'">
      <path d="M11 20c0-2.4-4-4.2-4-9a9 9 0 0 1 18 0c0 4.8-4 6.6-4 9" />
      <path d="M11 20h10M12 24h8M14 27h4M16 2V0M3 11H1m30 0h-2M5.5 3.5 4 2m24 0-1.5 1.5" />
    </g>
    <g v-else-if="name === 'home'">
      <path d="m4 14 12-10 12 10v13H4z" />
      <path d="M12 27V17h8v10M2 14l14-12 14 12" />
    </g>
    <g v-else-if="name === 'bag'">
      <path d="M5 11h22l-2 17H7z" />
      <path d="M11 12V8a5 5 0 0 1 10 0v4M12 18v5m8-5v5" />
    </g>
    <g v-else-if="name === 'gift'">
      <path d="M4 14h24v14H4zM3 9h26v5H3zM16 9v19" />
      <path d="M16 9c-8 0-10-6-6-7s6 7 6 7Zm0 0c8 0 10-6 6-7s-6 7-6 7Z" />
    </g>
    <g v-else-if="name === 'news'">
      <path d="M7 5h19v22H7zM4 9v16a2 2 0 0 0 2 2M11 10h11M11 15h11M11 20h6" />
      <path d="M11 23h3" />
    </g>
    <g v-else-if="name === 'building'">
      <path d="M5 28V5h16v23M21 12h6v16M2 28h28" />
      <path d="M9 9h3m4 0h1m-8 5h3m4 0h1m-8 5h3m4 0h1m4-3h2m-2 5h2M11 28v-4h5v4" />
    </g>
    <g v-else-if="name === 'receipt'">
      <path d="m7 4 3 2 3-2 3 2 3-2 3 2 3-2v24l-3-2-3 2-3-2-3 2-3-2-3 2z" />
      <path d="M11 12h10m-10 5h10m-10 5h6" />
    </g>
    <g v-else-if="name === 'rocket'">
      <path d="M18 5c4-3 8-3 10-3 0 2 0 6-3 10l-8 8-7-7z" />
      <path d="m10 13-5 1-3 5 8 1m7-1-1 5-5 4-1-8" />
      <circle cx="21" cy="8" r="2" />
      <path d="M7 22c-2 0-4 2-4 5 3 0 5-2 5-4" />
    </g>
    <g v-else-if="name === 'coffee'">
      <path d="M6 11h17v11a5 5 0 0 1-5 5h-7a5 5 0 0 1-5-5z" />
      <path d="M23 14h2a3 3 0 0 1 0 6h-2M10 7c-2-2 2-3 0-5m7 5c-2-2 2-3 0-5M4 30h23" />
    </g>
    <g v-else-if="name === 'coins'">
      <ellipse cx="12" cy="9" rx="8" ry="4" />
      <path d="M4 9v5c0 2 4 4 8 4s8-2 8-4V9M4 14v5c0 2 4 4 8 4 1 0 2 0 3-.3" />
      <ellipse cx="21" cy="21" rx="7" ry="4" />
      <path d="M14 21v5c0 2 3 4 7 4s7-2 7-4v-5" />
    </g>
    <g v-else-if="name === 'sparkle'">
      <path d="m16 3 2.6 8.4L27 14l-8.4 2.6L16 25l-2.6-8.4L5 14l8.4-2.6z" />
      <path d="m25 22 1.2 3.8L30 27l-3.8 1.2L25 32l-1.2-3.8L20 27l3.8-1.2zM6 2l1 3 3 1-3 1-1 3-1-3-3-1 3-1z" />
    </g>
    <g v-else-if="name === 'trend'">
      <path d="M5 25 13 17l5 5L28 9" />
      <path d="M19 9h9v9" />
      <path d="M5 5v22h23" />
    </g>
    <g v-else-if="name === 'bank'">
      <path d="m3 11 13-8 13 8M5 12h22M4 27h24M2 30h28" />
      <path d="M8 13v12m5-12v12m6-12v12m5-12v12" />
    </g>
    <g v-else-if="name === 'family'">
      <circle cx="12" cy="9" r="4" />
      <circle cx="23" cy="11" r="3" />
      <circle cx="18" cy="20" r="3" />
      <path d="M4 27v-3a8 8 0 0 1 16 0v3zm17-10a6 6 0 0 1 7 6v3h-7" />
    </g>
    <g v-else>
      <circle cx="11" cy="20" r="7" />
      <circle cx="11" cy="20" r="2" />
      <path d="m16 15 11-11 3 3-3 3 2 2-4 4-2-2-3 3" />
    </g>
  </svg>
</template>
