<script setup>
const {user,fa}=useReiki()
const {data:courses}=await useFetch('/api/catalog/courses',{query:{mine:1}})
</script>
<template><main class="page"><div class="page-heading"><h1>دوره‌های من</h1><p>از همان جایی که بودی ادامه بده.</p></div><NuxtLink v-if="!user" to="/profile" class="btn btn-primary">ورود به حساب</NuxtLink><div v-else-if="!courses?.length" class="state">هنوز دوره‌ای در حساب تو فعال نیست.<p>عضویت ویژه به‌تنهایی دوره‌ها را باز نمی‌کند.</p><NuxtLink to="/reiki" class="btn btn-ghost">دیدن دوره‌ها</NuxtLink></div><div v-else class="stack"><article v-for="c in courses" :key="c.id" class="card"><h2>{{c.title}}</h2><p>{{fa(c.percent)}}٪ تکمیل شده</p><progress :value="c.percent" max="100"/><NuxtLink :to="'/courses/'+c.id" class="btn btn-primary">ادامهٔ یادگیری</NuxtLink></article></div></main></template>
