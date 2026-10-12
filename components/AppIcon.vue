<script setup>
defineProps({name:String})
const paths={home:'M3 10 12 3 21 10V21H15V14H9V21H3Z',compass:'M12 3A9 9 0 1 0 12 21A9 9 0 1 0 12 3M16 8 14 14 8 16 10 10Z',lotus:'M12 3C18 9 16 14 12 18C8 14 6 9 12 3M12 18C5 17 3 12 3 8C8 9 10 13 12 18M12 18C19 17 21 12 21 8C16 9 14 13 12 18M5 21H19',book:'M12 5C8 3 4 3 2 4V20C6 19 9 19 12 21C15 19 18 19 22 20V4C18 3 15 3 12 5V21',user:'M8 7A4 4 0 1 0 16 7A4 4 0 1 0 8 7M3 22V20C3 12 21 12 21 20V22',moon:'M20 15A9 9 0 1 1 9 3A9 9 0 0 0 20 15',heart:'M12 21 3 12C-2 4 7 0 12 6C17 0 26 4 21 12Z',arrow:'M15 5 8 12 15 19',search:'M10 3A7 7 0 1 0 10 17A7 7 0 1 0 10 3M16 16 22 22'}
</script>
<template><svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true"><path :d="paths[name]||paths.lotus"/></svg></template>
