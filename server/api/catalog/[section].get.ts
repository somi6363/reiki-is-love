import { defineEventHandler,getRouterParam,getQuery } from 'h3'
import { all,get,parseJson } from '../../utils/db'
import { currentUser } from '../../utils/auth'
import { checkAccess,redact,ownsCourse,lessonUnlocked } from '../../utils/access'
import { published,normalize,fail,id } from '../../utils/http'
import { currentMoon,moonPhasesBetween,PHASE_FA,seasonsBetween } from '../../../lib/astro'
const safeContent=(r:any,uid?:number)=>redact({...r,payload:parseJson(r.payload,{})},checkAccess(r,uid))
export default defineEventHandler(e=>{
 const section=getRouterParam(e,'section'),q=getQuery(e),uid=currentUser(e)?.id
 if(section==='home')return {moon:currentMoon(),date:new Date().toISOString(),message:get('SELECT body FROM daily_messages WHERE active=1 ORDER BY id LIMIT 1')?.body,moods:all('SELECT * FROM moods ORDER BY sort_order'),featured:all(`SELECT c.*,t.title_fa type_title,t.slug type FROM content c JOIN content_types t ON t.id=c.type_id WHERE c.${published} ORDER BY featured DESC,c.id LIMIT 6`).map(r=>safeContent(r,uid))}
 if(section==='types')return all('SELECT * FROM content_types WHERE discoverable=1 ORDER BY sort_order')
 if(section==='categories')return all('SELECT * FROM categories WHERE hidden=0 ORDER BY sort_order,title_fa')
 if(section==='plans')return all('SELECT * FROM membership_plans WHERE active=1 ORDER BY sort_order').map(p=>({...p,benefits:parseJson(p.benefits,[])}))
 if(section==='content'){
  let rows=all(`SELECT c.*,t.title_fa type_title,t.slug type FROM content c JOIN content_types t ON t.id=c.type_id WHERE c.${published} ORDER BY featured DESC,c.sort_order,c.id DESC LIMIT 1000`)
  if(q.id){const r=rows.find(r=>r.id===id(q.id));if(!r)fail(404,'محتوا یافت نشد');return safeContent(r,uid)}
  if(q.type)rows=rows.filter(r=>r.type===q.type)
  if(q.q){const query=normalize(String(q.q).slice(0,100));rows=rows.filter(r=>normalize(r.title+' '+(r.summary||'')).includes(query))}
  if(q.category){const ids=new Set(all('SELECT content_id FROM content_categories WHERE category_id=?',id(q.category)).map(r=>r.content_id));rows=rows.filter(r=>ids.has(r.id))}
  if(q.mood){const ids=new Set(all('SELECT content_id FROM mood_recommendations WHERE mood_id=?',id(q.mood)).map(r=>r.content_id));rows=rows.filter(r=>ids.has(r.id))}
  return rows.slice(0,100).map(r=>safeContent(r,uid))
 }
 if(section==='calendar'){
  const from=new Date(),to=new Date(Date.now()+100*86400000)
  const calculated=[...moonPhasesBetween(from,to).map(p=>({id:`phase-${p.date.toISOString()}`,title:PHASE_FA[p.kind],starts_at:p.date.toISOString(),kind:p.kind,is_custom:0,astro:{note:'محاسبهٔ تقریبی Meeus؛ برای مشاهدهٔ فاز، نه تعیین رؤیت هلال. زمان نمایش: تهران.'}})),...seasonsBetween(from,to).map(p=>({id:`season-${p.date.toISOString()}`,title:p.titleFa,starts_at:p.date.toISOString(),kind:p.kind,is_custom:0,astro:{note:'زمان تقریبی محاسبه‌شده؛ با زمان رسمی ممکن است چند دقیقه تفاوت داشته باشد.'}}))]
  const custom=all('SELECT * FROM calendar_events WHERE datetime(starts_at)>=datetime(?) ORDER BY starts_at LIMIT 100',from.toISOString()).map(r=>({...r,astro:parseJson(r.astro,{})}))
  return [...calculated,...custom].sort((a,b)=>a.starts_at.localeCompare(b.starts_at))
 }
 if(section==='courses'){
  const rows=all(`SELECT * FROM courses WHERE ${published} ORDER BY sort_order`)
  const mapped=rows.map(c=>{const lessons=all('SELECT l.*,m.title module_title FROM course_lessons l JOIN course_modules m ON m.id=l.module_id WHERE m.course_id=? ORDER BY m.sort_order,l.sort_order,l.id',c.id).map(l=>{const access=lessonUnlocked(l,uid,c.id),done=uid?!!get("SELECT 1 FROM progress WHERE user_id=? AND subject_kind='lesson' AND subject_id=? AND completed_at IS NOT NULL",uid,l.id):false;return {...l,body:access.unlocked?l.body:null,homework:access.unlocked?l.homework:null,content_id:null,access,done}});return {...c,owned:ownsCourse(uid,c.id),lessons,percent:lessons.length?Math.round(100*lessons.filter(l=>l.done).length/lessons.length):0}})
  if(q.id){const c=mapped.find(c=>c.id===id(q.id));if(!c)fail(404,'دوره یافت نشد');return c}
  return q.mine?mapped.filter(c=>c.owned):mapped
 }
 if(section==='programs')return all(`SELECT * FROM programs WHERE ${published}`).map(p=>{const access=checkAccess(p,uid,'program'),en=uid?get('SELECT id FROM program_enrollments WHERE user_id=? AND program_id=?',uid,p.id):null,logs=en?all('SELECT day_number,done_at FROM program_day_logs WHERE enrollment_id=?',en.id):[];return {...p,access,logs,days:access.allowed?all('SELECT id,day_number,title,instructions,reflection,journal_prompt FROM program_days WHERE program_id=? ORDER BY day_number',p.id):[]}})
 fail(404,'بخش یافت نشد')
})
