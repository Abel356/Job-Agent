import {readFileSync} from 'node:fs';
import {neon} from '@neondatabase/serverless';
const sql=neon(process.env.DATABASE_URL);
const sources=['speedrun-sources.json','fortune500-sources.json','major-employers.json'].flatMap(file=>JSON.parse(readFileSync(new URL('../data/'+file,import.meta.url),'utf8')));
for(let i=0;i<sources.length;i+=40){
 await sql.transaction(sources.slice(i,i+40).map(s=>sql.query(
  'INSERT INTO sources(id,data,status) VALUES($1,$2,$3) ON CONFLICT(id) DO NOTHING',
  [s.id,JSON.stringify(s),'New source — awaiting refresh']
 )));
}
console.log(`Discovery registry: ${sources.filter(s=>s.kind==='speedrun-company').length} Speedrun companies, ${sources.filter(s=>s.kind==='fortune-company').length} Fortune 500 companies and portfolio directory registered; existing sources preserved.`);
