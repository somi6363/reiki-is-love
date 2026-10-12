<script setup>
// PWA navigateFallback target. Prerendered as a static asset, so it must not
// fetch anything — it renders even when the server is unreachable.
useHead({ title: 'آفلاین' })
</script>
<template>
  <main class="page offline">
    <div class="state">
      <div class="state-icon">🌙</div>
      <h1 class="state-title">فعلاً بدون ارتباط</h1>
      <p class="state-body">
        این صفحه از حافظهٔ دستگاه باز شد. وقتی اتصال برگشت، دوباره تلاش کن؛
        نوشته‌های ذخیره‌شدهٔ تو روی دستگاه امن‌اند.
      </p>
      <button class="btn btn-primary" @click="location.reload()">تلاش دوباره</button>
    </div>
  </main>
</template>
