import { defineEventHandler,getRouterParam } from 'h3'
import { requireAdmin } from '../../utils/auth'
import { all,get,run,tx } from '../../utils/db'
import { body,fail,text,id,amount,oneOf } from '../../utils/http'
// Explicit table/field allowlists; never expose journals through an admin registry.
const registry: Record<string,{table:string;fields:string[]}>={
 content:{table:'content',fields:['type_id','slug','title','summary','body','payload','access_type','price','course_id','status','published_at','featured']},
 categories:{table:'categories',fields:['taxonomy','slug','title_fa','description','hidden']},
 types:{table:'content_types',fields:['slug','title_fa','field_schema']},
 calendar:{table:'calendar_events',fields:['kind','title','starts_at','is_custom','astro']}
}
export default defineEventHandler(async e=>{
 requireAdmin(e);const section=getRouterParam(e,'section')||''
 if(e.method==='GET'){
  if(section==='overview')return {users:get('SELECT count(*) n FROM users').n,content:get('SELECT count(*) n FROM content').n,pending:get("SELECT count(*) n FROM purchases WHERE status='pending'").n}
  if(section==='users')return all('SELECT id,name,email,created_at FROM users ORDER BY id DESC LIMIT 300')
  if(section==='purchases')return all('SELECT p.*,u.name FROM purchases p JOIN users u ON u.id=p.user_id ORDER BY p.id DESC LIMIT 300')
  if(section==='entitlements')return all('SELECT e.*,u.name FROM entitlements e JOIN users u ON u.id=e.user_id ORDER BY e.id DESC LIMIT 300')
  const spec=registry[section];if(!spec)fail(404,'بخش مدیریت یافت نشد')
  const rows:any[]=all(`SELECT * FROM ${spec.table} ORDER BY id DESC LIMIT 500`)
  if(section==='content'){
    // Attach assigned categories so the edit form can preselect them.
    const m=new Map<number,number[]>()
    for(const l of all<{content_id:number,category_id:number}>('SELECT content_id,category_id FROM content_categories')){
      const a=m.get(l.content_id)||[];a.push(l.category_id);m.set(l.content_id,a)
    }
    for(const r of rows)r.category_ids=m.get(r.id)||[]
  }
  return rows
 }
 if(e.method!=='POST')fail(405,'روش مجاز نیست')
 const b=await body(e)
 if(section==='purchases'){
  const pid=id(b.id)
  return tx(()=>{const p=get('SELECT * FROM purchases WHERE id=?',pid);if(!p)fail(404,'خرید یافت نشد');if(p.status!=='pending')return {ok:true};const scope=p.item_kind==='membership'?'premium':p.item_kind;if(!['premium','course','content','program'].includes(scope))fail(400,'محصول پشتیبانی نمی‌شود');let expiry=null;if(scope==='premium'){const plan=get('SELECT period FROM membership_plans WHERE id=?',p.item_id);if(!plan)fail(404,'طرح یافت نشد');const last=get("SELECT max(expires_at) expiry FROM entitlements WHERE user_id=? AND scope='premium' AND revoked_at IS NULL",p.user_id)?.expiry;expiry=new Date(Math.max(Date.now(),Date.parse(last||'')||0)+(plan.period==='yearly'?365:30)*86400000).toISOString()}
   run("UPDATE purchases SET status='paid',paid_at=datetime('now') WHERE id=?",pid)
   run("INSERT INTO entitlements(user_id,scope,ref_id,source,purchase_id,expires_at) VALUES (?,?,?,'purchase',?,?)",p.user_id,scope,scope==='premium'?null:p.item_id,pid,expiry)
   return {ok:true}
  })
 }
 if(section==='entitlements'){
  if(b.action==='revoke'){run("UPDATE entitlements SET revoked_at=datetime('now') WHERE id=?",id(b.id));return {ok:true}}
  const uid=id(b.user_id),scope=oneOf(b.scope,['premium','course','content','program']);if(!get('SELECT id FROM users WHERE id=?',uid))fail(404,'کاربر یافت نشد');const ref=scope==='premium'?null:id(b.ref_id)
  if(ref){const table={course:'courses',content:'content',program:'programs'}[scope];if(!get(`SELECT id FROM ${table} WHERE id=?`,ref))fail(404,'محصول یافت نشد')}
  const expiry=scope==='premium'?new Date(Date.now()+30*86400000).toISOString():null
  run("INSERT INTO entitlements(user_id,scope,ref_id,source,expires_at) VALUES (?,?,?,'admin_grant',?)",uid,scope,ref,expiry);return {ok:true}
 }
 const spec=registry[section];if(!spec)fail(404,'بخش مدیریت یافت نشد')
 if(b.action==='delete'){
  const row=get(`SELECT * FROM ${spec.table} WHERE id=?`,id(b.id));if(!row)fail(404,'یافت نشد');if(section==='types')fail(400,'برای حفظ ارتباط‌ها نوع محتوا را حذف نکنید')
  run(`DELETE FROM ${spec.table} WHERE id=?`,id(b.id));return {ok:true}
 }
 const d:any={}
 let catIds:number[]|null=null
 for(const key of spec.fields)if(b[key]!==undefined)d[key]=b[key]
 if(section==='content'){
  d.type_id=id(d.type_id);if(!get('SELECT id FROM content_types WHERE id=?',d.type_id))fail(400,'نوع محتوا معتبر نیست')
  d.title=text(d.title,160);d.slug=text(d.slug,180);d.summary=text(d.summary||'',1000,false);d.body=text(d.body||'',60000,false)
  d.access_type=oneOf(d.access_type,['free','premium','individual','course','specific']);d.status=oneOf(d.status,['draft','published','hidden','scheduled']);d.price=amount(d.price);d.featured=d.featured?1:0
  d.course_id=d.access_type==='course'?id(d.course_id):null
  if(d.course_id&&!get('SELECT id FROM courses WHERE id=?',d.course_id))fail(400,'دوره معتبر نیست')
  try{const obj=JSON.parse(d.payload||'{}');if(!obj||typeof obj!=='object'||Array.isArray(obj))throw 0;d.payload=JSON.stringify(obj)}catch{fail(400,'فیلدهای تکمیلی باید JSON معتبر باشند')}
  d.published_at=d.published_at||null;if(d.published_at&&!Number.isFinite(Date.parse(d.published_at)))fail(400,'زمان انتشار معتبر نیست')
  // Optional: full replacement of category assignments for this content.
  // Absent key = keep current links, so other clients (or partial edits) can
  // never silently detach content from every category.
  if(b.category_ids!==undefined){
    if(!Array.isArray(b.category_ids))fail(400,'دسته‌ها باید فهرست باشند')
    catIds=[...new Set<number>(b.category_ids.map((x:any)=>Number(x)))].filter(x=>Number.isInteger(x)&&x>0)
    for(const c of catIds)if(!get('SELECT id FROM categories WHERE id=?',c))fail(400,'دسته انتخابشده معتبر نیست')
  }
 }else if(section==='types'){
  d.slug=text(d.slug,80);if(!/^[a-z][a-z0-9_-]*$/.test(d.slug))fail(400,'شناسهٔ انگلیسی ساده وارد کنید');d.title_fa=text(d.title_fa,100);d.field_schema=d.field_schema||'[]';try{if(!Array.isArray(JSON.parse(d.field_schema)))throw 0}catch{fail(400,'ساختار فیلدها باید آرایه JSON باشد')}
 }else if(section==='categories'){d.taxonomy=text(d.taxonomy||'general',60);d.slug=text(d.slug,100);d.title_fa=text(d.title_fa,100);d.description=text(d.description||'',1000,false);d.hidden=d.hidden?1:0}
 else {d.title=text(d.title,160);d.kind='custom:'+text(d.kind||'event',60).replace(/^custom:/,'');if(!Number.isFinite(Date.parse(d.starts_at)))fail(400,'تاریخ معتبر وارد کنید');d.starts_at=new Date(d.starts_at).toISOString();d.is_custom=1;d.astro=JSON.stringify({note:text(b.note||'رویداد سفارشی مدیر',1000)})}
 const keys=Object.keys(d),vals=keys.map(k=>d[k])
 // Upsert + link replacement share one transaction: a failed link write must
 // not leave a half-saved content row (and vice versa).
 return tx(()=>{
  let rowId:number
  if(b.id){if(!get(`SELECT id FROM ${spec.table} WHERE id=?`,id(b.id)))fail(404,'یافت نشد');run(`UPDATE ${spec.table} SET ${keys.map(k=>k+'=?').join(',')} WHERE id=?`,...vals,id(b.id));rowId=id(b.id)}
  else{const r=run(`INSERT INTO ${spec.table} (${keys.join(',')}) VALUES (${keys.map(()=>'?').join(',')})`,...vals);rowId=Number(r.lastInsertRowid)}
  if(section==='content'&&catIds){
   run('DELETE FROM content_categories WHERE content_id=?',rowId)
   for(const c of catIds)run('INSERT OR IGNORE INTO content_categories(content_id,category_id) VALUES (?,?)',rowId,c)
  }
  return {ok:true,id:rowId}
 })
})
