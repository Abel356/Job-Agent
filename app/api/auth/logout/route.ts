import {sessionCookie} from '@/lib/auth';
export async function POST(req:Request){if(req.headers.get('origin')!==new URL(req.url).origin)return Response.json({error:'Cross-origin write denied'},{status:403});return Response.json({signed_out:true},{headers:{'Set-Cookie':sessionCookie('',0),'Cache-Control':'private, no-store'}});}
