import {readFileSync} from 'node:fs';
import {neon} from '@neondatabase/serverless';
import {jobSignals} from '../lib/matching.ts';
const sql=neon(process.env.DATABASE_URL);
const discovery=JSON.parse(readFileSync(new URL('../data/employer-discovery.json',import.meta.url),'utf8'));
let registered=0;
for(let i=0;i<discovery.boards.length+discovery.indexes.length;i+=100){
 const batch=[...discovery.indexes,...discovery.boards].slice(i,i+100);
 const result=await sql.query("INSERT INTO sources(id,data,status) SELECT item->>'id',item::text,'New source — awaiting employer check' FROM jsonb_array_elements($1::jsonb) item ON CONFLICT(id) DO NOTHING RETURNING id",[JSON.stringify(batch)]);registered+=result.length;
}
console.log(`Employer discovery: ${registered} new sources registered; existing sources preserved.`);
// Persist small, non-personal job signals once. Résumés never enter this database.
let cursor='',count=0;
while(true){
 const rows=await sql.query("SELECT id,data FROM jobs WHERE active=1 AND id>$1 AND (data::jsonb->'match_signals'->>'version') IS DISTINCT FROM '1' ORDER BY id LIMIT 100",[cursor]);
 if(!rows.length)break;
 const values=rows.map(row=>{const job=JSON.parse(row.data);return {id:row.id,hash:job.description_hash||'',signals:jobSignals(job.position||'',job.description||'')};});
 // Don't overwrite signals if a concurrent refresh changed the description.
 await sql.query("UPDATE jobs j SET data=(j.data::jsonb || jsonb_build_object('match_signals',v->'signals'))::text FROM jsonb_array_elements($1::jsonb) v WHERE j.id=v->>'id' AND COALESCE(j.data::jsonb->>'description_hash','')=v->>'hash'",[JSON.stringify(values)]);
 cursor=rows.at(-1).id;count+=rows.length;
}
console.log(`Résumé matching: compact job signals prepared for ${count} existing postings.`);
