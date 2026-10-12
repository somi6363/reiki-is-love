<script setup>
const {user,fa,date}=useReiki()
const {data:items,error}=await useFetch('/api/account/purchases',{immediate:!!user.value,default:()=>[]})
const names={membership:'عضویت',course:'دوره',content:'محتوا',program:'برنامه'},states={pending:'در انتظار بررسی',paid:'تأیید شده',failed:'ناموفق',refunded:'بازپرداخت‌شده',granted:'اعطاشده'}
</script>
<template><main class="page"><div class="page-heading"><h1>درخواست‌های من</h1><p>درگاه پرداخت این نسخه فعال نیست.</p></div><NuxtLink v-if="!user" to="/profile" class="btn btn-primary">ورود</NuxtLink><p v-else-if="error">دریافت درخواست‌ها ممکن نشد.</p><p v-else-if="!items.length" class="state">هنوز درخواستی ثبت نکرده‌ای.</p><div v-else class="stack"><article v-for="p in items" :key="p.id" class="card"><span class="badge badge-premium">{{states[p.status]}}</span><h3>{{names[p.item_kind]}} · شناسهٔ محصول {{fa(p.item_id)}}</h3><p>{{fa(p.amount)}} تومان</p><small>{{date(p.created_at.replace(' ','T')+'Z')}}</small></article></div></main></template>
