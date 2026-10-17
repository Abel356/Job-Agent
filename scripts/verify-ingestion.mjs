import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {INGEST_SQL,EXISTING_JOBS_SQL} from '../lib/ingestion.ts';
const pg=new PGlite();
await pg.exec(readFileSync(new URL('../db/schema.sql',import.meta.url),'utf8'));
const run=async id=>{await pg.query("UPDATE runs SET status='completed' WHERE status='running'");await pg.query("INSERT INTO runs(id,started,status) VALUES($1,'2026-10-17','running')",[id]);};
await run('run1');
const packet={run_id:'run1',batch_id:'batch1',source:{id:'large',name:'Large employer'},jobs:[],closed_ids:[],expired_ids:[],seen_ids:[],final:false,complete:false,error:'',now:'2026-10-17'};
const job=(id,source='large')=>({id,source_id:source,position:'Engineer',posting_date:'2026-10-17',description_hash:'a',description:'Employer text '.repeat(1000)});
const save=async overrides=>pg.transaction(async tx=>{
 await tx.query('SELECT id FROM runs WHERE id=$1 FOR UPDATE',[overrides.run_id||packet.run_id]);
 return (await tx.query(INGEST_SQL,[JSON.stringify({...packet,...overrides})])).rows[0]?.result;
});
let first=await save({jobs:[job('one'),job('two')]});
assert.deepEqual(first,{added:2,changed:0,closed:0,protocol:2});
assert.deepEqual(await save({jobs:[job('one'),job('two')]}),first,'Lost-response retry returns committed receipt');
assert.equal((await pg.query('SELECT added FROM runs')).rows[0].added,2,'Retry cannot double count');
assert.equal((await pg.query('SELECT checked FROM sources')).rows[0].checked,null,'Partial batch cannot claim source is checked');
// The database must not transfer descriptions or match evidence to the collector.
const compactRows=(await pg.query(EXISTING_JOBS_SQL,[''])).rows;
assert.equal(compactRows.length,2);
assert.equal(JSON.parse(compactRows[0].data).position,'Engineer');
assert(!('description' in JSON.parse(compactRows[0].data)));
assert(!('match_signals' in JSON.parse(compactRows[0].data)));
assert(Buffer.byteLength(JSON.stringify(compactRows))<1000,'Bootstrap response remains compact despite long descriptions');
assert.equal((await pg.query(EXISTING_JOBS_SQL,['one'])).rows[0].id,'two','Bootstrap cursor advances');
await save({batch_id:'edit',jobs:[{...job('one'),description_hash:'b'}]});
assert.equal((await pg.query('SELECT changed FROM runs')).rows[0].changed,1);
await save({batch_id:'final1',final:true,complete:true,seen_ids:['one']});
await save({batch_id:'final1',final:true,complete:true,seen_ids:['one']});
assert.deepEqual((await pg.query("SELECT active,missing_runs FROM jobs WHERE id='two'")).rows[0],{active:1,missing_runs:1},'Retry cannot count a second missing check');
await run('run2');
await save({run_id:'run2',batch_id:'partial-error',final:true,complete:false,error:'Employer unavailable'});
assert.equal((await pg.query("SELECT active FROM jobs WHERE id='two'")).rows[0].active,1,'Failed source must preserve jobs');
await save({run_id:'run2',batch_id:'final2',final:true,complete:true,seen_ids:['one']});
assert.equal((await pg.query("SELECT active FROM jobs WHERE id='two'")).rows[0].active,0,'Two successful checks archive missing jobs');
// A transaction that loses a later statement must roll back its jobs AND receipt.
await assert.rejects(pg.transaction(async tx=>{await tx.query(INGEST_SQL,[JSON.stringify({...packet,run_id:'run2',batch_id:'rollback',jobs:[job('rollback')]})]);throw Error('simulated failure');}));
assert.equal((await pg.query("SELECT count(*)::int AS n FROM jobs WHERE id='rollback'")).rows[0].n,0);
assert.equal((await pg.query("SELECT count(*)::int AS n FROM ingest_receipts WHERE batch_id='rollback'")).rows[0].n,0);
await save({run_id:'run2',batch_id:'rollback',jobs:[job('rollback')]});
// Large board: old implementation returned all metadata per packet, then issued
// thousands of separate closure statements. This returns only three counters.
await pg.query("INSERT INTO jobs(id,source_id,data,first_seen,last_seen) SELECT 'large-'||n,'large',jsonb_build_object('position','Engineer','description',repeat('x',10000))::text,'old','old' FROM generate_series(1,12000) n");
const large=await save({run_id:'run2',batch_id:'large-final',final:true,complete:true,seen_ids:['one','rollback']});
assert.equal(large.closed,0);
await run('run3');
const closed=await save({run_id:'run3',batch_id:'large-final2',final:true,complete:true,seen_ids:['one','rollback']});
assert.equal(closed.closed,12000);
await save({run_id:'run3',batch_id:'deadline',expired_ids:['one']});
assert.equal((await pg.query("SELECT data::jsonb->>'closure_reason' AS reason FROM jobs WHERE id='one'")).rows[0].reason,'Application deadline passed');
await pg.query("UPDATE runs SET status='completed' WHERE id='run3'");
assert.equal(await save({run_id:'run3',batch_id:'late',jobs:[job('late')]}),undefined,'Finished run rejects new writes');
assert.deepEqual(await save({run_id:'run3',batch_id:'large-final2'}),closed,'Committed response can be recovered after finish');
await pg.close();
console.log('PostgreSQL ingestion verified: atomic rollback, retry receipts, exact counters, safe missing checks, deadlines and 12,000-job source.');
