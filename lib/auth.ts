import {createHash,timingSafeEqual} from 'node:crypto';
function equal(a:string,b:string){const x=createHash('sha256').update(a).digest(),y=createHash('sha256').update(b).digest();return timingSafeEqual(x,y);}
export function updaterAuthorized(req:Request){const updater=process.env.UPDATER_SECRET;return Boolean(updater&&updater.length>=32&&equal(req.headers.get('authorization')||'','Bearer '+updater));}
