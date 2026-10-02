import {createHash} from 'node:crypto';
import {db} from '@/lib/database';
import {newSession,validPassword,sessionCookie} from '@/lib/auth';
export const dynamic='force-dynamic';
export async function POST(req:Request){
 const headers={'Cache-Control':'private, no-store'};
 if(req.headers.get('origin')!==new URL(req.url).origin)return Response.json({error:'Sign in from this workspace.'},{status:403,headers});
 try{
  const ip=(req.headers.get('x-forwarded-for')||'unknown').split(',')[0].trim();const key=createHash('sha256').update(ip).digest('hex');const now=Date.now(),windowStart=Math.floor(now/900000)*900000;
  const attempt=await db().prepare('INSERT INTO login_attempts(key,window_start,attempts) VALUES(?,?,1) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN login_attempts.window_start=excluded.window_start THEN login_attempts.attempts+1 ELSE 1 END,window_start=excluded.window_start RETURNING attempts').bind(key,windowStart).first<{attempts:number}>();
  if(!attempt||attempt.attempts>8)return Response.json({error:'Too many attempts. Try again in 15 minutes.'},{status:429,headers:{...headers,'Retry-After':'900'}});
  const body=await req.json();if(typeof body.password!=='string'||body.password.length>512||!validPassword(body.password))return Response.json({error:'The password is incorrect or private access is not configured.'},{status:401,headers});
  await db().prepare('DELETE FROM login_attempts WHERE key=? OR window_start<?').bind(key,now-86400000).run();
  return Response.json({signed_in:true},{headers:{...headers,'Set-Cookie':sessionCookie(newSession())}});
 }catch{return Response.json({error:'Sign-in is temporarily unavailable.'},{status:503,headers});}
}
