<script setup>
const {data:courses}=await useFetch('/api/catalog/courses')
const {data:pages}=await useFetch('/api/catalog/content',{query:{type:'reiki_page'}})
const {fa}=useReiki()
</script>
<template><main class="page"><div class="page-heading"><small>از شناخت تا تجربه</small><h1>مسیر ریکی</h1><p>آموزش آگاهانه، تمرین آرام و مراقبت از خود</p></div><ContentCard v-for="p in pages" :key="p.id" :item="p"/><div class="row filters"><NuxtLink to="/my-courses" class="btn btn-primary">دوره‌های من</NuxtLink><NuxtLink to="/programs" class="btn btn-ghost">تمرین ۲۱ روزه</NuxtLink></div><section class="section"><h2>دوره‌های آموزشی</h2><p class="disclaimer">خرید دوره مستقل از عضویت ویژه است.</p><NuxtLink v-for="c in courses" :key="c.id" :to="'/courses/'+c.id" class="course-card"><div class="course-art"><AppIcon name="lotus"/><small>REIKI · LEVEL 01</small></div><div><h2>{{c.title}}</h2><p>{{c.summary}}</p><span class="badge badge-premium">{{c.owned?'دورهٔ شما':fa(c.price)+' تومان'}}</span><p class="read-more">مشاهدهٔ سرفصل‌ها ←</p></div></NuxtLink></section><p class="disclaimer">ریکی جایگزین درمان پزشکی نیست. آموزش‌های این نسخه نمونه‌اند، نه دورهٔ حرفه‌ای تکمیل‌شده.</p></main></template>
