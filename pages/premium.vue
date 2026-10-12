<script setup>
const {data:plans}=await useFetch('/api/catalog/plans')
const {user,send,busy,fa}=useReiki()
async function request(p){if(!user.value)return navigateTo('/profile');await send('/api/account/purchases',{kind:'membership',id:p.id})}
</script>
<template><main class="page"><div class="page-heading"><small>فضای بیشتر برای همراهی</small><h1>عضویت ویژه</h1><p>مانتراها، مراقبه‌ها و تمرین‌های ویژه در یک کتابخانه</p></div><p class="card">دوره‌های ریکی جداگانه خریداری می‌شوند و با عضویت ویژه باز نمی‌شوند.</p><div class="stack section"><article v-for="p in plans" :key="p.id" class="card premium-card"><span class="badge badge-premium">{{p.period==='monthly'?'۳۰ روز':'۳۶۵ روز'}}</span><h2>{{p.title}}</h2><p class="price">{{fa(p.price)}} <small>تومان</small></p><ul><li v-for="b in p.benefits" :key="b">{{b}}</li></ul><button class="btn btn-gold btn-block" :disabled="busy" @click="request(p)">ثبت درخواست عضویت</button></article></div><p class="disclaimer">قیمت‌ها نمونه‌اند. درگاه و تمدید خودکار فعال نیست. هیچ مبلغی با این دکمه کسر نمی‌شود؛ درخواست برای بررسی دستی ثبت می‌شود.</p><NuxtLink to="/purchases">پیگیری درخواست‌های من ←</NuxtLink></main></template>
