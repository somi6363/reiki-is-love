import { defineEventHandler,setHeader } from 'h3'
import { mutationGuard } from '../utils/http'
export default defineEventHandler(event=>{
 setHeader(event,'Cache-Control','private, no-store')
 setHeader(event,'X-Content-Type-Options','nosniff')
 setHeader(event,'X-Frame-Options','DENY')
 setHeader(event,'Referrer-Policy','same-origin')
 if(event.path.startsWith('/api/')&&!['GET','HEAD','OPTIONS'].includes(event.method))mutationGuard(event)
})
