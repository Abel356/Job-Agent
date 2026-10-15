import {readFileSync} from 'node:fs';
import {neon} from '@neondatabase/serverless';
const sql=neon(process.env.DATABASE_URL);
const jobs=JSON.parse(readFileSync(new URL('../data/major-employer-jobs.json',import.meta.url),'utf8'));
let inserted=0;
for(let i=0;i<jobs.length;i+=30){
 const results=await sql.transaction(jobs.slice(i,i+30).map(j=>sql.query('INSERT INTO jobs(id,source_id,data,active,first_seen,last_seen) VALUES($1,$2,$3,1,$4,$4) ON CONFLICT(id) DO NOTHING RETURNING id',[j.id,j.source_id,JSON.stringify(j),j.link_checked_at])));
 inserted+=results.reduce((n,r)=>n+r.length,0);
}
console.log(`Major employers: ${inserted} verified sample postings imported; full coverage awaits the daily refresh.`);
