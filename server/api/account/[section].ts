import { defineEventHandler,getRouterParam } from 'h3'
import { requireUser } from '../../utils/auth'
import { all,get,run,tx } from '../../utils/db'
import { checkAccess,lessonUnlocked } from '../../utils/access'
import { body,fail,text,id,amount,oneOf,published } from '../../utils/http'
export default defineEventHandler(async e=>{
 const u=requireUser(e),s=getRouterParam(e,'section')
 if(e.method==='GET'){
  if(s==='journal')return all('SELECT * FROM journal_entries WHERE user_id=? ORDER BY entry_date DESC,id DESC LIMIT 500',u.id)
  if(s==='favorites')return all(`SELECT c.id,c.title,c.summary,c.access_type FROM favorites f JOIN content c ON c.id=f.subject_id WHERE f.user_id=? AND f.subject_kind='content' AND c.${published}`,u.id)
  if(s==='progress')return all('SELECT * FROM progress WHERE user_id=?',u.id)
  if(s==='purchases')return all('SELECT * FROM purchases WHERE user_id=? ORDER BY id DESC',u.id)
  fail(404,'یافت نشد')
 }
 if(e.method!=='POST')fail(405,'روش مجاز نیست')
 const b=await body(e)
 if(s==='journal'){
  if(b.id && !get('SELECT id FROM journal_entries WHERE id=? AND user_id=?',id(b.id),u.id))fail(404,'نوشته یافت نشد')
  if(b.action==='delete'){run('DELETE FROM journal_entries WHERE id=? AND user_id=?',id(b.id),u.id);return {ok:true}}
  const title=text(b.title,160),content=text(b.body,30000,false),mood=text(b.mood||'',80,false)
  const date=text(b.entry_date||new Date().toISOString().slice(0,10),10)
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date)))fail(400,'تاریخ معتبر نیست')
  if(b.id)run("UPDATE journal_entries SET title=?,body=?,mood=?,entry_date=?,updated_at=datetime('now') WHERE id=? AND user_id=?",title,content,mood,date,id(b.id),u.id)
  else run('INSERT INTO journal_entries(user_id,title,body,mood,entry_date) VALUES (?,?,?,?,?)',u.id,title,content,mood,date)
  return {ok:true}
 }
 if(s==='favorites'){
  const cid=id(b.id)
  if(!get(`SELECT id FROM content WHERE id=? AND ${published}`,cid))fail(404,'محتوا یافت نشد')
  if(b.saved===true)run("INSERT OR IGNORE INTO favorites(user_id,subject_kind,subject_id) VALUES (?,'content',?)",u.id,cid)
  else run("DELETE FROM favorites WHERE user_id=? AND subject_kind='content' AND subject_id=?",u.id,cid)
  return {ok:true}
 }
 if(s==='progress'){
  const kind=oneOf(b.kind,['content','mantra','lesson']),ref=id(b.id),position=amount(b.position,1000000)
  if(kind==='lesson'){
   const l=get('SELECT l.*,m.course_id FROM course_lessons l JOIN course_modules m ON m.id=l.module_id JOIN courses c ON c.id=m.course_id WHERE l.id=? AND c.status=\'published\'',ref)
   if(!l||!lessonUnlocked(l,u.id,l.course_id).unlocked)fail(403,'این درس هنوز باز نشده است')
  }else{
   const c=get(`SELECT * FROM content WHERE id=? AND ${published}`,ref)
   if(!c||!checkAccess(c,u.id).allowed)fail(403,'دسترسی به محتوا ندارید')
  }
  const done=b.done===true?new Date().toISOString():null
  run(`INSERT INTO progress(user_id,subject_kind,subject_id,position_sec,percent,completed_at) VALUES (?,?,?,?,?,?) ON CONFLICT(user_id,subject_kind,subject_id) DO UPDATE SET position_sec=excluded.position_sec,percent=excluded.percent,completed_at=coalesce(excluded.completed_at,progress.completed_at),updated_at=datetime('now')`,u.id,kind,ref,position,done?100:0,done)
  return {ok:true}
 }
 if(s==='programs'){
  const pid=id(b.id),day=id(b.day),p=get(`SELECT * FROM programs WHERE id=? AND ${published}`,pid)
  if(!p||!checkAccess(p,u.id,'program').allowed)fail(403,'دسترسی به برنامه ندارید')
  if(!get('SELECT id FROM program_days WHERE program_id=? AND day_number=?',pid,day))fail(404,'روز یافت نشد')
  tx(()=>{run('INSERT OR IGNORE INTO program_enrollments(user_id,program_id) VALUES (?,?)',u.id,pid);const en=get('SELECT id FROM program_enrollments WHERE user_id=? AND program_id=?',u.id,pid);run('INSERT OR IGNORE INTO program_day_logs(enrollment_id,day_number) VALUES (?,?)',en.id,day)})
  return {ok:true}
 }
 if(s==='purchases'){
  const kind=oneOf(b.kind,['membership','course','content','program']),ref=id(b.id)
  const tables={membership:'membership_plans',course:'courses',content:'content',program:'programs'}
  const item=get(`SELECT * FROM ${tables[kind]} WHERE id=?`,ref)
  if(!item||(kind==='membership'?!item.active:item.status!=='published'))fail(404,'محصول موجود نیست')
  if(['content','program'].includes(kind)&&item.access_type!=='individual')fail(400,'این محتوا فروش تکی ندارد')
  const existing=get("SELECT id FROM purchases WHERE user_id=? AND item_kind=? AND item_id=? AND status='pending'",u.id,kind,ref)
  if(!existing)run("INSERT INTO purchases(user_id,item_kind,item_id,amount,provider) VALUES (?,?,?,?,'manual')",u.id,kind,ref,item.price)
  return {ok:true,message:'درخواست ثبت شد. درگاه پرداخت فعال نیست؛ دسترسی فقط پس از تأیید مدیر صادر می‌شود.'}
 }
 fail(404,'بخش یافت نشد')
})
