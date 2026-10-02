import {createHash,createHmac,timingSafeEqual,randomBytes} from 'node:crypto';
export const SESSION_COOKIE='earthwork_session';
const AGE=7*24*3600;
function equal(a:string,b:string){const x=createHash('sha256').update(a).digest(),y=createHash('sha256').update(b).digest();return timingSafeEqual(x,y);}
function configured(){return Boolean(process.env.APP_PASSWORD&&process.env.APP_PASSWORD.length>=16&&process.env.SESSION_SECRET&&process.env.SESSION_SECRET.length>=32);}
function signature(value:string){return createHmac('sha256',process.env.SESSION_SECRET!).update(value+'|'+createHash('sha256').update(process.env.APP_PASSWORD!).digest('hex')).digest('base64url');}
export function validPassword(value:string){return configured()&&equal(value,process.env.APP_PASSWORD!);}
export function newSession(){if(!configured())throw Error('Private access is not configured');const payload=Buffer.from(JSON.stringify({exp:Math.floor(Date.now()/1000)+AGE,nonce:randomBytes(16).toString('hex')})).toString('base64url');return payload+'.'+signature(payload);}
export function validSession(value:string|undefined){if(!configured()||!value)return false;try{const [payload,sig,...rest]=value.split('.');if(!payload||!sig||rest.length||!equal(sig,signature(payload)))return false;const data=JSON.parse(Buffer.from(payload,'base64url').toString());return typeof data.exp==='number'&&data.exp>Math.floor(Date.now()/1000)&&data.exp<=Math.floor(Date.now()/1000)+AGE;}catch{return false;}}
export function cookieValue(req:Request){return req.headers.get('cookie')?.split(';').map(v=>v.trim()).find(v=>v.startsWith(SESSION_COOKIE+'='))?.slice(SESSION_COOKIE.length+1);}
export function authorized(req:Request){const updater=process.env.UPDATER_SECRET;return Boolean(updater&&updater.length>=32&&equal(req.headers.get('authorization')||'','Bearer '+updater))||validSession(cookieValue(req));}
export function sessionCookie(value:string,maxAge=AGE){return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;}
