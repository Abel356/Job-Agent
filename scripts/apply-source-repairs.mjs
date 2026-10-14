import {readFileSync} from 'node:fs';
import {neon} from '@neondatabase/serverless';
const sql=neon(process.env.DATABASE_URL);
const repairs=JSON.parse(readFileSync(new URL('../data/source-repairs.json',import.meta.url),'utf8'));
let applied=0;
for(let i=0;i<repairs.length;i+=30){
 const results=await sql.transaction(repairs.slice(i,i+30).map(r=>sql.query(
  `UPDATE sources SET data=(data::jsonb || $2::jsonb)::text,
   status=CASE WHEN $3::boolean THEN 'Ashby verified — refresh pending' ELSE status END,
   error=CASE WHEN $3::boolean THEN '' ELSE error END
   WHERE id=$1 AND checked IS NOT DISTINCT FROM $4 AND error=$5
   AND data::jsonb->>'url'=$6 AND NOT jsonb_exists(data::jsonb,'ashby_fallback')
   RETURNING id`,
  [r.id,JSON.stringify(r.patch),r.verified,r.original_checked,r.original_error,r.original_url]
 )));
 applied+=results.reduce((n,rows)=>n+rows.length,0);
}
console.log(`Ashby recheck history applied to ${applied} unchanged sources; ${repairs.filter(r=>r.verified).length} verified board/feed repairs available. Jobs await a full refresh.`);
