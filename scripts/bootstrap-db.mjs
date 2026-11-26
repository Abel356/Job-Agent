// Runs on Vercel production builds so database setup requires no local API access.
import {neon} from '@neondatabase/serverless';
if(process.env.USE_DATABASE!=='1'){
 console.log('Serving the bounded tech-jobs snapshot and Simplify GitHub sync; database bootstrap skipped.');
}else if(process.env.VERCEL_ENV!=='production'){
 console.log('Automatic database setup is reserved for production deployments.');
}else{
 for(const [key,min] of [['DATABASE_URL',1],['APP_PASSWORD',16],['SESSION_SECRET',32],['UPDATER_SECRET',32]]){
  if(!process.env[key]||process.env[key].length<min)throw Error(`Configure server-only ${key} before deploying production.`);
 }
 await import('./migrate-db.mjs');
 const sql=neon(process.env.DATABASE_URL);
 // Use the same three-hour limit as start-run; never clear a recent active run.
 const interrupted=await sql.query("UPDATE runs SET status='interrupted',finished=$1 WHERE status='running' AND started<$2 RETURNING id",[new Date().toISOString(),new Date(Date.now()-3*3600000).toISOString()]);
 console.log(`Refresh lifecycle: ${interrupted.length} abandoned runs released.`);
 const marker=await sql.query("SELECT value FROM settings WHERE key='initial_import_complete'");
 if(marker[0]?.value!=='true')await import('./seed-db.mjs');
 else console.log('Initial import already completed; current jobs and schedule status preserved.');
 await import('./seed-discovery.mjs');
 await import('./apply-source-repairs.mjs');
 await import('./seed-major-jobs.mjs');
 await import('./seed-matching.mjs');
}

