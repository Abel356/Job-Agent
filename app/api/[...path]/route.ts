import {createHash} from 'node:crypto';
import {INGEST_SQL,EXISTING_JOBS_SQL} from '@/lib/ingestion';
import {storageError} from '@/lib/storage-error';
import {db,all} from '@/lib/database';
import {decorate,CATEGORIES} from '@/lib/jobs';
import updater from '@/lib/updater-source';
import {deadlinePassed} from '@/lib/job-query';
import {fetchSource} from '@/lib/public-fetch';
import {updaterAuthorized} from '@/lib/auth';
import {staticJobs,staticById,staticSettings,staticSources} from '@/lib/static-jobs';
export const dynamic='force-dynamic';
export const maxDuration=60;
const response=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
function path(req:Request){return new URL(req.url).pathname.slice(5);}
function rowJob(r:any){const j=decorate(JSON.parse(r.data));return {...j,first_seen:r.first_seen,last_seen:r.last_seen,category_override:r.category_override,categories:r.category_override?[r.category_override]:j.categories};}
export async function GET(req:Request){const p=path(req);if(p!=='jobs'&&p!=='sources'&&!p.startsWith('job/')&&!updaterAuthorized(req))return response({error:'Updater authorization required.'},401);try{
 if(process.env.USE_DATABASE!=='1'){
  if(p==='jobs'){
   const cursor=new URL(req.url).searchParams.get('after')||'';
   const start=cursor?staticJobs.findIndex(j=>j.id>cursor):0;
   const page=staticJobs.slice(start<0?staticJobs.length:start,(start<0?staticJobs.length:start)+250);
   return response({jobs:page.map(({description,...j})=>j),next_cursor:page.length===250?page.at(-1)?.id:null,...(new URL(req.url).searchParams.get('summary')==='0'?{}:{settings:staticSettings,runs:[]})});
  }
  if(p.startsWith('job/'))return staticById.has(p.slice(4))?response(staticById.get(p.slice(4))):response({error:'Role not found'},404);
  if(p==='sources')return response({sources:staticSources});
 }
 if(p==='refresh-protocol')return response({version:2,atomic_ingest:true});
 if(p==='migration-export'){const [jobs,sources,runs,settings]=await Promise.all([all<any>('SELECT * FROM jobs'),all<any>('SELECT * FROM sources'),all<any>('SELECT * FROM runs'),all<any>('SELECT * FROM settings')]);return response({schema_version:1,exported_at:new Date().toISOString(),jobs,sources,runs,settings});}
 if(p==='jobs'){
  const cursor=new URL(req.url).searchParams.get('after')||'';
  const rows=await all<any>("SELECT id,CASE WHEN data::jsonb->'international'->>'version'='2' AND data::jsonb->'match_signals'->>'version'='2' THEN (data::jsonb - 'description')::text ELSE data END AS data,first_seen,last_seen,category_override FROM jobs WHERE active=1 AND id>? ORDER BY id LIMIT 250",[cursor]);
  const includeSummary=new URL(req.url).searchParams.get('summary')!=='0';
  const [settings,runs]=includeSummary?await Promise.all([all<any>('SELECT key,value FROM settings'),all<any>('SELECT * FROM runs ORDER BY started DESC LIMIT 12')]):[null,null];
  return response({jobs:rows.map(rowJob).filter(j=>!deadlinePassed(j.deadline_iso||j.deadline||'')).map(({description,...j})=>j),next_cursor:rows.length===250?rows.at(-1).id:null,...(settings&&runs?{settings:Object.fromEntries(settings.map(r=>[r.key,JSON.parse(r.value)])),runs}:{})});
 }
 if(p.startsWith('job/')){const r=await db().prepare('SELECT * FROM jobs WHERE id=?').bind(p.slice(4)).first<any>();return r?response(rowJob(r)):response({error:'Role not found'},404);}
 if(p==='sources')return response({sources:(await all<any>('SELECT * FROM sources')).map(r=>({...JSON.parse(r.data),status:r.status,checked:r.checked,error:r.error}))});
 if(p==='existing-jobs'){
  const cursor=new URL(req.url).searchParams.get('after')||'';
  const rows=await all<any>(EXISTING_JOBS_SQL,[cursor]);
  return response({existing:rows.map(r=>{const j=JSON.parse(r.data);return {id:r.id,source_id:r.source_id,company:j.company,position:j.position,apply_url:j.apply_url,posting_date:j.posting_date,description_hash:j.description_hash,date_basis:j.date_basis,deadline:j.deadline,deadline_iso:j.deadline_iso,deadline_evidence:j.deadline_evidence,link_checked_at:j.link_checked_at,compensation:j.compensation};}),next_cursor:rows.length===500?rows.at(-1).id:null});
 }
 if(p==='rates'){try{const r=await fetch('https://www.bankofcanada.ca/valet/observations/FXUSDCAD,FXEURCAD,FXGBPCAD/json?recent=1',{signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('FX unavailable');const d:any=await r.json(),o=d.observations?.at(-1);return response({date:o?.d,rates:{CAD:1,USD:Number(o?.FXUSDCAD?.v)||null,EUR:Number(o?.FXEURCAD?.v)||null,GBP:Number(o?.FXGBPCAD?.v)||null}});}catch{return response({date:'',rates:{CAD:1}});}}
 if(p==='updater')return new Response(updater,{headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'private, no-store'}});
 return response({error:'Not found'},404);
 }catch(e){console.error(e);const failure=storageError(e,'Job storage is temporarily unavailable. Please try again.',503);return response(failure.body,failure.status);}}
export async function POST(req:Request){if(!updaterAuthorized(req))return response({error:'Updater authorization required.'},401);try{
 // Public visitors can read jobs; maintenance writes require the updater bearer secret.
 const origin=req.headers.get('origin');if(origin&&origin!==new URL(req.url).origin)return response({error:'Cross-origin write denied'},403);
 const p=path(req);
 if(process.env.USE_DATABASE!=='1')return response({error:'Persistent job edits are paused while the database is unavailable.'},503);
 const body:any=await req.json(),database=db();
 if(p==='register-source'){const s=body.source;if(!s?.id||!s.name||!['ashby','greenhouse','lever','lever-eu','html','workday','workable','speedrun','speedrun-company','fortune-company','amazon','tesla','meta','smartrecruiters','employer-index'].includes(s.kind)||!/^https?:\/\//.test(s.url))return response({error:'Invalid source'},400);await database.prepare('INSERT INTO sources(id,data,status) VALUES(?,?,?) ON CONFLICT(id) DO NOTHING').bind(s.id,JSON.stringify(s),'New source').run();return response({saved:true});}
 if(p==='public-fetch'){
  if(typeof body.url!=='string'||typeof body.source_id!=='string')return response({error:'Invalid source request'},400);
  const source=await database.prepare('SELECT data FROM sources WHERE id=?').bind(body.source_id).first<any>();if(!source)return response({error:'Unknown source'},404);
  try{return response(await fetchSource(body.url,JSON.parse(source.data),body.request_data));}catch(e){return response({status:502,body:e instanceof Error?e.message:'Source could not be fetched',url:body.url});}
 }
 if(p==='expire'){
  // Read only deadline metadata in bounded pages, never every full description.
  const cursor=typeof body.after==='string'?body.after:'';
  const rows=await all<any>("SELECT id,data::jsonb->>'deadline_iso' AS deadline_iso,data::jsonb->>'deadline' AS deadline FROM jobs WHERE active=1 AND id>? ORDER BY id LIMIT 500",[cursor]);
  const expired=rows.filter(r=>deadlinePassed(r.deadline_iso||r.deadline||'')).map(r=>r.id);
  let count=0;
  if(expired.length){
   // One atomic statement makes retries safe, including the run's closed count.
   const result=await database.prepare("WITH expired AS (UPDATE jobs SET active=0,data=(data::jsonb || jsonb_build_object('closure_reason','Application deadline passed','closed_at',?::text))::text WHERE active=1 AND id IN (SELECT jsonb_array_elements_text(?::jsonb)) RETURNING id), counted AS (SELECT COUNT(*)::integer AS amount FROM expired), run_update AS (UPDATE runs SET closed=closed+counted.amount FROM counted WHERE id=? AND status='running') SELECT amount FROM counted").bind(new Date().toISOString(),JSON.stringify(expired),body.run_id||'').first<{amount:number}>();
   count=result?.amount||0;
  }
  return response({expired:count,next_cursor:rows.length===500?rows.at(-1).id:null});
 }
 if(p==='import'){
  if(!Array.isArray(body.jobs)||body.jobs.length>100||!Array.isArray(body.sources)||body.sources.length>100)return response({error:'Invalid import batch'},400);
  const now=body.checked_at||new Date().toISOString();const statements=[];
  for(const s of body.sources){if(!s.id||!s.name||!['ashby','greenhouse','lever','lever-eu','html','workable','workday','speedrun','speedrun-company','fortune-company','amazon','tesla','meta','smartrecruiters','employer-index'].includes(s.kind))throw Error('Invalid source');statements.push(database.prepare('INSERT INTO sources(id,data,checked,status,error) VALUES(?,?,?,?,?) ON CONFLICT(id) DO NOTHING').bind(s.id,JSON.stringify(s),s.checked||now,s.status||'Imported',s.error||''));}
  for(const raw of body.jobs){if(!raw.id||!raw.source_id||!/^https?:\/\//.test(raw.apply_url))throw Error('Invalid job');const j=decorate(raw);statements.push(database.prepare('INSERT INTO jobs(id,source_id,data,active,first_seen,last_seen) VALUES(?,?,?,1,?,?) ON CONFLICT(id) DO NOTHING').bind(j.id,j.source_id,JSON.stringify(j),now,j.link_checked_at||now));}
  for(let i=0;i<statements.length;i+=80)await database.batch(statements.slice(i,i+80));return response({imported:statements.length});
 }
 if(p==='settings'){
  const allowed=['schedule_enabled','schedule_label','seed_checked_at'];const stm=[];for(const [key,val] of Object.entries(body)){if(!allowed.includes(key))return response({error:'Unknown setting'},400);stm.push(database.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(key,JSON.stringify(val)));}if(stm.length)await database.batch(stm);return response({saved:true});
 }
 if(p==='category'){
  if(!body.id||(body.category!==null&&!CATEGORIES.includes(body.category)))return response({error:'Invalid category'},400);
  await database.prepare('UPDATE jobs SET category_override=? WHERE id=?').bind(body.category,body.id).run();return response({saved:true});
 }
 if(p==='start-run'){
  if(body.run_id!==undefined&&(typeof body.run_id!=='string'||! /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.run_id)))return response({error:'Invalid refresh identifier'},400);
  const now=new Date().toISOString(),cutoff=new Date(Date.now()-3*3600000).toISOString(),id=body.run_id||crypto.randomUUID();
  await database.prepare("DELETE FROM ingest_receipts USING runs WHERE ingest_receipts.run_id=runs.id AND runs.status<>'running' AND runs.finished<?").bind(new Date(Date.now()-7*86400000).toISOString()).run();
  const result=await database.batch([
   database.prepare('SELECT pg_advisory_xact_lock(74198632)'),
   database.prepare("UPDATE runs SET status='interrupted',finished=? WHERE status='running' AND started<?").bind(now,cutoff),
   database.prepare("INSERT INTO runs(id,started,status) SELECT ?,?,'running' WHERE NOT EXISTS(SELECT 1 FROM runs WHERE status='running') ON CONFLICT(id) DO NOTHING RETURNING id").bind(id,now),
   database.prepare("SELECT id,started FROM runs WHERE status='running'")
  ]);
  const active=result[3]?.[0];
  return active?.id===id?response({id}):response({error:active?'A refresh is already running':'This refresh identifier has already finished',active_run:active||null},409);
 }
 if(p==='ingest'){
  if(!body.source?.id||!body.run_id||!Array.isArray(body.jobs)||body.jobs.length>100)return response({error:'Invalid refresh batch'},400);
  const closedIds=Array.isArray(body.closed_ids)?body.closed_ids:[],expiredIds:string[]=[];
  const jobs=body.jobs.filter((raw:any)=>{
   if(!raw.id||!/^https?:\/\//.test(raw.apply_url))return false;
   if(deadlinePassed(raw.deadline_iso||raw.deadline||'')){expiredIds.push(raw.id);return false;}
   return !closedIds.includes(raw.id);
  }).map((raw:any)=>decorate({...raw,source_id:body.source.id}));
  const packet={run_id:body.run_id,batch_id:body.batch_id||createHash('sha256').update(JSON.stringify(body)).digest('hex'),
   source:body.source,jobs,closed_ids:closedIds,expired_ids:expiredIds,seen_ids:body.seen_ids||body.jobs.map((j:any)=>j.id),
   final:!body.partial,complete:!!body.complete,error:String(body.error||'').slice(0,2000),now:new Date().toISOString()};
  // Row lock serializes saves and finish-run. The receipt, counters, jobs and
  // closure checks commit together, so a lost response can be retried safely.
  const result=await database.batch([
   database.prepare("SELECT set_config('lock_timeout','10s',true),set_config('statement_timeout','40s',true)"),
   database.prepare("SELECT id FROM runs WHERE id=? FOR UPDATE").bind(body.run_id),
   database.prepare(INGEST_SQL).bind(JSON.stringify(packet))
  ]);
  const saved=(result[2] as any[])?.[0];
  return saved?response(saved.result):response({error:'Refresh is not running'},409);
 }
 if(p==='finish-run'){const result=await database.prepare("UPDATE runs SET finished=?,status=? WHERE id=? AND status='running' RETURNING id").bind(new Date().toISOString(),body.interrupted?'interrupted':body.verification?'verified':body.error?'partial':'completed',body.run_id).run();return response({finished:result.length>0});}
 return response({error:'Not found'},404);
 }catch(e){console.error(e);const failure=storageError(e,'The update could not be saved. Please retry.',500);return response(failure.body,failure.status);}}

