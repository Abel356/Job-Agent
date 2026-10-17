// One atomic, replay-safe save. PostgreSQL handles large sources without returning
// every stored posting to the function. Call after locking the run in a transaction.
export const INGEST_SQL=`
WITH input AS (SELECT $1::jsonb AS b),
prior_receipt AS (SELECT result FROM ingest_receipts,input WHERE run_id=b->>'run_id' AND batch_id=b->>'batch_id'),
guard AS (SELECT b FROM input WHERE NOT EXISTS(SELECT 1 FROM prior_receipt)
 AND EXISTS(SELECT 1 FROM runs WHERE id=b->>'run_id' AND status='running')),
incoming AS MATERIALIZED (SELECT DISTINCT ON (j->>'id') j FROM guard,jsonb_array_elements(b->'jobs') j ORDER BY j->>'id'),
previous AS MATERIALIZED (SELECT jobs.id,jobs.data::jsonb->>'position' AS position,jobs.data::jsonb->>'posting_date' AS posting_date,
 jobs.data::jsonb->>'description_hash' AS description_hash FROM jobs JOIN incoming ON jobs.id=j->>'id'),
saved AS (
 INSERT INTO jobs(id,source_id,data,active,missing_runs,first_seen,last_seen)
 SELECT j->>'id',b->'source'->>'id',j::text,1,0,b->>'now',b->>'now' FROM incoming,guard
 ON CONFLICT(id) DO UPDATE SET data=excluded.data,active=1,missing_runs=0,last_seen=excluded.last_seen
 RETURNING id
),
closed_jobs AS (
 UPDATE jobs SET
 active=CASE WHEN id IN (SELECT jsonb_array_elements_text(b->'closed_ids'))
 OR id IN (SELECT jsonb_array_elements_text(b->'expired_ids')) OR missing_runs>=1 THEN 0 ELSE 1 END,
 missing_runs=CASE WHEN id IN (SELECT jsonb_array_elements_text(b->'closed_ids'))
 OR id IN (SELECT jsonb_array_elements_text(b->'expired_ids')) THEN missing_runs ELSE missing_runs+1 END,
 data=CASE WHEN id IN (SELECT jsonb_array_elements_text(b->'closed_ids'))
 OR id IN (SELECT jsonb_array_elements_text(b->'expired_ids')) OR missing_runs>=1
 THEN (data::jsonb || jsonb_build_object('closed_at',b->>'now','closure_reason',
 CASE WHEN id IN (SELECT jsonb_array_elements_text(b->'expired_ids')) THEN 'Application deadline passed'
 WHEN id IN (SELECT jsonb_array_elements_text(b->'closed_ids')) THEN 'Employer closed the application page'
 ELSE 'Missing from two successful employer checks' END))::text ELSE data END
 FROM guard WHERE source_id=b->'source'->>'id' AND active=1
 AND id NOT IN (SELECT j->>'id' FROM incoming)
 AND (id IN (SELECT jsonb_array_elements_text(b->'closed_ids')) OR id IN (SELECT jsonb_array_elements_text(b->'expired_ids'))
 OR ((b->>'final')::boolean AND (b->>'complete')::boolean AND b->>'error'=''
 AND id NOT IN (SELECT jsonb_array_elements_text(b->'seen_ids'))))
 RETURNING active
),
source_write AS (
 INSERT INTO sources(id,data,checked,status,error)
 SELECT b->'source'->>'id',(b->'source')::text,CASE WHEN (b->>'final')::boolean THEN b->>'now' END,
 CASE WHEN NOT (b->>'final')::boolean THEN 'Updating' WHEN b->>'error'<>'' THEN 'Check incomplete'
 WHEN b->'source'->'recovery' IS NOT NULL THEN 'Recovered via Ashby' ELSE 'Checked' END,b->>'error' FROM guard
 ON CONFLICT(id) DO UPDATE SET data=excluded.data,
 checked=CASE WHEN excluded.checked IS NULL THEN sources.checked ELSE excluded.checked END,
 status=CASE WHEN excluded.checked IS NULL THEN sources.status ELSE excluded.status END,
 error=CASE WHEN excluded.checked IS NULL THEN sources.error ELSE excluded.error END
),
counts AS (SELECT
 (SELECT count(*) FROM saved LEFT JOIN previous USING(id) WHERE previous.id IS NULL)::integer AS added,
 (SELECT count(*) FROM saved JOIN previous USING(id) JOIN incoming ON j->>'id'=saved.id
 WHERE previous.position IS DISTINCT FROM j->>'position' OR previous.posting_date IS DISTINCT FROM j->>'posting_date'
 OR previous.description_hash IS DISTINCT FROM j->>'description_hash')::integer AS changed,
 (SELECT count(*) FROM closed_jobs WHERE active=0)::integer AS closed),
run_write AS (UPDATE runs SET checked=checked+CASE WHEN (b->>'final')::boolean THEN 1 ELSE 0 END,
 failed=failed+CASE WHEN (b->>'final')::boolean AND b->>'error'<>'' THEN 1 ELSE 0 END,
 added=runs.added+counts.added,changed=runs.changed+counts.changed,closed=runs.closed+counts.closed
 FROM guard,counts WHERE runs.id=b->>'run_id' RETURNING runs.id),
receipt AS (INSERT INTO ingest_receipts(run_id,batch_id,result)
 SELECT b->>'run_id',b->>'batch_id',jsonb_build_object('added',added,'changed',changed,'closed',closed,'protocol',2)
 FROM guard,counts WHERE EXISTS(SELECT 1 FROM run_write) RETURNING result)
SELECT result FROM receipt UNION ALL SELECT result FROM prior_receipt
`;
