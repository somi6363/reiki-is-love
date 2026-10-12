import { createError, getHeader, getRequestURL, readBody } from 'h3'
import type { H3Event } from 'h3'
export const fail=(code:number,message:string):never=>{ throw createError({statusCode:code,message}) }
export const text=(v:unknown,max=200,required=true):string=>{if(typeof v!=='string'||v.length>max||(required&&!v.trim()))fail(400,'اطلاعات واردشده معتبر نیست');return (v as string).trim()}
export const id=(v:unknown):number=>{const n=Number(v);if(!Number.isSafeInteger(n)||n<1)fail(400,'شناسه معتبر نیست');return n}
export const oneOf=(v:unknown,items:string[])=>{if(typeof v!=='string'||!items.includes(v))fail(400,'گزینه معتبر نیست');return v as string}
export const amount=(v:unknown,max=1000000000)=>{const n=Number(v??0);if(!Number.isSafeInteger(n)||n<0||n>max)fail(400,'عدد معتبر نیست');return n}
export const body=async(e:H3Event)=>{if(Number(getHeader(e,'content-length')||0)>100000)fail(413,'حجم درخواست زیاد است');const b=await readBody(e);if(!b||typeof b!=='object'||Array.isArray(b))fail(400,'بدنهٔ درخواست معتبر نیست');return b}
export const mutationGuard=(e:H3Event)=>{
 const origin=getHeader(e,'origin'), expected=process.env.APP_ORIGIN||getRequestURL(e).origin
 if(origin && origin!==expected)fail(403,'مبدأ درخواست معتبر نیست')
 if(getHeader(e,'x-reiki-action')!=='1'||!getHeader(e,'content-type')?.startsWith('application/json'))fail(403,'درخواست معتبر نیست')
}
// Single-process preview limiter. Replace with shared Redis limits before horizontal scaling.
const buckets=new Map<string,{n:number;until:number}>()
export const limit=(key:string,max=20)=>{const now=Date.now();for(const [k,v] of buckets)if(v.until<now)buckets.delete(k);const v=buckets.get(key)||{n:0,until:now+900000};v.n++;buckets.set(key,v);if(v.n>max)fail(429,'تلاش‌های زیادی انجام شده؛ ۱۵ دقیقه دیگر امتحان کنید.')}
export const published="status='published' AND (published_at IS NULL OR datetime(published_at)<=datetime('now'))"
export const normalize=(s:string)=>s.normalize('NFKC').replace(/ي/g,'ی').replace(/ك/g,'ک').replace(/[\u200c\u200d]/g,' ').replace(/[\u064b-\u065f]/g,'').toLowerCase()
