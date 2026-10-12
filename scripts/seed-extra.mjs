import { db, run, get, upsertContent, contentId, moodId } from './seed-core.mjs'
const note = '\n\nاین تمرین مکمل مراقبت از خود است؛ جایگزین تشخیص، درمان یا مشاورهٔ پزشکی نیست.'
for (const [i, title, text] of [
 [1,'ریکی چیست؟','ریکی روشی ژاپنی برای تمرین توجه و آرام‌سازی است. میکائو اوسویی در اوایل قرن بیستم این روش را آموزش داد. مفهوم انرژی در ریکی یک دیدگاه سنتی است، نه سازوکاری پزشکیِ اثبات‌شده.'],
 [2,'پنج اصل ریکی','فقط برای امروز: با نگرانی‌هایم مهربان باشم، خشمم را بشناسم، سپاسگزار باشم، صادقانه تلاش کنم و با خود و دیگران مهربان باشم. این‌ها بازنویسی آموزشی اصول سنتی‌اند.'],
 [3,'شروع مراقبه، بدون سخت‌گیری','دو دقیقه بنشینید و تماس پا با زمین را حس کنید. نفس را به زور تغییر ندهید. وقتی فکری آمد، توجه را آرام به نفس برگردانید. هدف خالی کردن کامل ذهن نیست.'],
 [4,'ماه و دفتر تأمل','فاز ماه نتیجهٔ هندسهٔ خورشید، زمین و ماه است. استفاده از این چرخه برای نیت‌نویسی یک انتخاب نمادین است؛ شواهدی برای تضمین تغییر خلق یا سلامتی بر پایهٔ ماه وجود ندارد.'],
 [5,'مرزهای مهربان','امروز یک خواستهٔ کوچک را با جمله‌ای روشن بیان کنید: الان به کمی سکوت نیاز دارم. مرزبندی قرار نیست دیگری را کنترل کند؛ از نیاز خود با احترام حرف می‌زنیم.']
]) upsertContent({type:'article',slug:`sample-article-${i}`,title,summary:text.slice(0,110),body:text+note,tags:['آرامش'],featured:i===1})
upsertContent({type:'reiki_page',slug:'welcome',title:'مسیر ریکی، از آشنایی تا تمرین',summary:'معرفی آموزش‌ها و تمرین‌های مراقبت از خود',body:'آشنایی با ریکی برای همه آزاد است. دوره‌ها مستقل از عضویت ویژه خریداری می‌شوند. هم‌سویی در سنت ریکی یک آیین آموزشی است و تضمین درمان نیست.'+note})
upsertContent({type:'breathwork',slug:'easy-breath',title:'یک دقیقه تنفس آرام',summary:'بدون نگه‌داشتن نفس یا فشار',body:'به نرمی دم و بازدم طبیعی را دنبال کنید. اگر سرگیجه یا ناراحتی داشتید، تمرین را متوقف کنید. این تمرین را هنگام رانندگی انجام ندهید.'+note,payload:{pattern:'دم و بازدم طبیعی',rounds:6}})
run(`INSERT OR IGNORE INTO courses(slug,title,summary,description,price,instructor,status,published_at) VALUES (?,?,?,?,?,?,?,?)`,'reiki-1','ریکی سطح یک','دورهٔ نمونه • آشنایی، اصول و تمرین روزانه','دورهٔ آموزشی نمونه؛ گواهی و آموزش حرفه‌ای هنوز ارائه نمی‌شود.',1200000,'Reiki_islove','published',new Date().toISOString())
const course=get('SELECT id FROM courses WHERE slug=?','reiki-1').id
if (!get('SELECT id FROM course_modules WHERE course_id=?',course)) {
 const mod=Number(run('INSERT INTO course_modules(course_id,title) VALUES (?,?)',course,'آغاز مسیر').lastInsertRowid)
 for (const [i,title,body] of [[0,'خوش‌آمد و مراقبت از خود','این درس پیش‌نمایش رایگان است. تمرین را بدون انتظار نتیجهٔ درمانی آغاز کنید.'],[1,'اصول روزانه','یکی از پنج اصل را انتخاب کنید و یک مثال از زندگی خود بنویسید.'],[2,'تمرین توجه به دست‌ها','دست‌ها را راحت روی ران‌ها بگذارید و گرمای طبیعی آن‌ها را حس کنید. با تنفس طبیعی سه دقیقه استراحت کنید.']])
 run('INSERT INTO course_lessons(module_id,title,body,is_preview,unlock_rule,sort_order) VALUES (?,?,?,?,?,?)',mod,title,body+note,i===0?1:0,i===2?'after_previous':'immediate',i)
}
for (const [slug,title,n,kind,access] of [['reiki-21','۲۱ روز همراهی با خود',21,'reiki_practice','free'],['gratitude-7','۷ روز قدردانی',7,'challenge','free'],['presence-14','۱۴ روز حضور',14,'challenge','premium']]) {
 run('INSERT OR IGNORE INTO programs(slug,title,summary,day_count,kind,access_type,status) VALUES (?,?,?,?,?,?,?)',slug,title,'قدم‌های کوچک، بدون قضاوت و عجله',n,kind,access,'published')
 const id=get('SELECT id FROM programs WHERE slug=?',slug).id
 for(let day=1;day<=n;day++) run('INSERT OR IGNORE INTO program_days(program_id,day_number,title,instructions,reflection,journal_prompt) VALUES (?,?,?,?,?,?)',id,day,`روز ${day}: ${['مکث','مهربانی','توجه به بدن','قدردانی','استراحت','مرزبندی','مرور هفته'][(day-1)%7]}`,'سه دقیقه در وضعیت راحت بنشینید. توجه را به نفس طبیعی برگردانید. امروز یک رفتار کوچک و مهربانانه با خود انجام دهید.'+note,'قرار نیست هر روز یک حس مشخص داشته باشید.','امروز چه چیزی را در خودم دیدم که پیش از این نادیده می‌گرفتم؟')
}
for (const [slug,title] of [['individual','جلسهٔ همراهی و آرام‌سازی'],['intro','گفت‌وگوی آشنایی با ریکی']]) run('INSERT OR IGNORE INTO services(slug,title,summary,description,duration_min,price) VALUES (?,?,?,?,?,?)',slug,title,'خدمت نمونه؛ زمان با هماهنگی تأیید می‌شود.',note,45,350000)
// Explicit sample custom events, not fabricated astronomical predictions.
for (const [i,title] of ['نشست نمونهٔ مراقبه','کارگاه نمونهٔ ژورنال','همراهی گروهی ریکی'].entries()) run('INSERT OR IGNORE INTO calendar_events(kind,title,starts_at,is_custom,astro) VALUES (?,?,?,?,?)',`custom:sample-${i}`,title,`2026-10-${String(5+i*7).padStart(2,'0')}T14:30:00.000Z`,1,JSON.stringify({note:'رویداد آزمایشی؛ برگزاری واقعی تأیید نشده است.'}))
if(!get('SELECT id FROM daily_messages LIMIT 1')) run('INSERT INTO daily_messages(body) VALUES (?)','لازم نیست امروز همه‌چیز را حل کنی؛ یک نفس و یک قدم کافی است.')
if(!get('SELECT mood_id FROM mood_recommendations LIMIT 1')) for(const mood of ['aramam','moztaram','khastam','zehn-sholoogh','narahatam','tamarkoz','aramesh','rahaei']) for(const [type,slug] of [['mantra','so-hum'],['meditation',mood==='khastam'?'night-release':'five-minute-calm'],['breathwork','easy-breath']]) run('INSERT INTO mood_recommendations(mood_id,content_id) VALUES (?,?)',moodId(mood),contentId(type,slug))
console.log('✓ articles, course, programs, custom events, services and recommendations seeded')
db.close()
