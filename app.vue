<script setup lang="ts">
/**
 * App shell — top greeting area + bottom navigation (brief: max 5 items).
 *
 * The nav labels are the brief's own five sections; anything else in the app
 * is reached from inside them, which keeps the thumb bar uncluttered.
 */
const route = useRoute()
const { user, message, loadUser } = useReiki()
if (route.path !== '/offline') await loadUser()
useHead({title:'Reiki is Love'})

const items = [
  { to: '/', icon: 'home', label: 'خانه' },
  { to: '/discover', icon: 'compass', label: 'کشف' },
  { to: '/reiki', icon: 'lotus', label: 'ریکی' },
  { to: '/library', icon: 'book', label: 'کتابخانه' },
  { to: '/profile', icon: 'user', label: 'پروفایل' },
]
</script>

<template>
  <div class="app">
    <VitePwaManifest />
    <header class="brand-bar"><NuxtLink to="/" class="brand"><img src="/favicon.svg" width="42" height="42" alt=""/><span dir="ltr">Reiki is Love<small>فضایی برای بازگشت به خود</small></span></NuxtLink><NuxtLink to="/profile" class="avatar" aria-label="حساب کاربری">{{user?.name?.slice(0,1)||'♡'}}</NuxtLink></header>
    <NuxtPage />
    <div v-if="message" class="notice" role="status">{{message}}<button aria-label="بستن پیام" @click="message=''">×</button></div>

    <nav class="nav" aria-label="ناوبری اصلی">
      <NuxtLink
        v-for="item in items"
        :key="item.to"
        :to="item.to"
        class="nav-item"
        :class="{ 'is-active': item.to === '/' ? route.path === '/' : route.path.startsWith(item.to) }"
        :aria-current="route.path === item.to ? 'page' : undefined"
      >
        <AppIcon :name="item.icon" />
        <span>{{ item.label }}</span>
      </NuxtLink>
    </nav>
  </div>
</template>

<style>
.nav {
  position: fixed;
  inset-inline: 0;
  bottom: 0;
  z-index: 50;
  display: flex;
  justify-content: space-around;
  height: calc(var(--nav-h) + env(safe-area-inset-bottom));
  padding-bottom: env(safe-area-inset-bottom);
  background: color-mix(in srgb, var(--card) 88%, transparent);
  backdrop-filter: blur(12px);
  border-top: 1px solid var(--sage-light);
}
.nav-item {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  color: var(--ink-mute);
  font-size: var(--fs-xs);
}
.nav-item.is-active {
  color: var(--emerald);
}
</style>
