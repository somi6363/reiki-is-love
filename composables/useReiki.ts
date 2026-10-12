export const useReiki=()=>{
 const user=useState<any>('current-user',()=>null)
 const message=useState<string>('notice',()=>''),busy=useState('saving',()=>false)
 const api=useRequestFetch()
 const loadUser=async()=>{const r:any=await api('/api/auth/me');user.value=r.user;return r.user}
 const send=async(url:string,data:any)=>{busy.value=true;message.value='';try{const result:any=await $fetch(url,{method:'POST',headers:{'x-reiki-action':'1'},body:data});message.value=result.message||'ذخیره شد';return result}catch(e:any){message.value=e.data?.message||'ارتباط برقرار نشد؛ دوباره امتحان کنید';return null}finally{busy.value=false}}
 const fa=(n:any)=>Number(n||0).toLocaleString('fa-IR')
 const date=(s:any)=>new Intl.DateTimeFormat('fa-IR',{dateStyle:'full',timeZone:'Asia/Tehran'}).format(new Date(s))
 const time=(s:any)=>new Intl.DateTimeFormat('fa-IR',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Tehran'}).format(new Date(s))
 return {user,message,busy,loadUser,send,fa,date,time}
}
