import { defineEventHandler,getRouterParam,getRequestIP } from 'h3'
import { currentUser,createSession,destroySession,hashPassword,verifyPassword } from '../../utils/auth'
import { get,run,tx } from '../../utils/db'
import { body,fail,text,limit } from '../../utils/http'
export default defineEventHandler(async e=>{
 const action=getRouterParam(e,'action')
 if(e.method==='GET'&&action==='me')return {user:currentUser(e)}
 if(e.method!=='POST')fail(405,'روش مجاز نیست')
 if(action==='logout'){destroySession(e);return {ok:true}}
 if(!['login','register'].includes(action||''))fail(404,'یافت نشد')
 limit('auth:'+getRequestIP(e),40)
 const b=await body(e),email=text(b.email,254).toLowerCase(),password=text(b.password,128)
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))fail(400,'ایمیل معتبر وارد کنید')
 limit('email:'+email,15)
 if(action==='register'){
  const name=text(b.name,80)
  if(password.length<12)fail(400,'رمز عبور باید حداقل ۱۲ نویسه داشته باشد')
  if(get('SELECT id FROM users WHERE email=?',email))fail(409,'امکان ساخت این حساب نیست؛ ورود را امتحان کنید')
  const userId=tx(()=>{const uid=Number(run('INSERT INTO users(email,name,password_hash) VALUES (?,?,?)',email,name,hashPassword(password)).lastInsertRowid);run("INSERT INTO user_roles(user_id,role_id) SELECT ?,id FROM roles WHERE slug='user'",uid);return uid})
  createSession(e,userId)
 }else{
  const u=get('SELECT * FROM users WHERE email=? AND disabled_at IS NULL',email)
  if(!u||!verifyPassword(password,u.password_hash))fail(401,'ایمیل یا رمز عبور صحیح نیست')
  destroySession(e);createSession(e,u.id)
 }
 return {ok:true}
})
