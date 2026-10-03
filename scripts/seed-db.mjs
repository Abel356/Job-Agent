import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {neon} from '@neondatabase/serverless';
if(!process.env.DATABASE_URL)throw Error('Set DATABASE_URL before importing.');
const sql=neon(process.env.DATABASE_URL);
const data=JSON.parse(gunzipSync(readFileSync(new URL('../data/earthwork-snapshot.json.gz',import.meta.url))));
if(data.schema_version!==1)throw Error('Unsupported data export.');
for(const table of ['sources','jobs','runs','settings']){
 const columns={sources:['id','data','checked','status','error'],jobs:['id','source_id','data','active','missing_runs','first_seen','last_seen','category_override'],runs:['id','started','finished','status','checked','failed','added','changed','closed'],settings:['key','value']}[table];
 const rows=data[table];
 for(let i=0;i<rows.length;i+=40){const queries=rows.slice(i,i+40).map(r=>sql.query(`INSERT INTO ${table}(${columns.join(',')}) VALUES(${columns.map((_,i)=>'$'+(i+1)).join(',')}) ON CONFLICT(${table==='settings'?'key':'id'}) DO NOTHING`,columns.map(c=>r[c]??null)));await sql.transaction(queries);}
 console.log(`${table}: ${rows.length} exported records processed (existing records preserved).`);
}
// A copied old-host schedule must not imply that GitHub scheduling is connected.
await sql.transaction([
 sql.query("INSERT INTO settings(key,value) VALUES('schedule_enabled','false') ON CONFLICT(key) DO UPDATE SET value='false'"),
 sql.query("INSERT INTO settings(key,value) VALUES('initial_import_complete','true') ON CONFLICT(key) DO UPDATE SET value='true'")
]);
console.log('Import complete. Enable the schedule only after its first successful GitHub run.');
