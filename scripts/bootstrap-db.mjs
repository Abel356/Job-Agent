// Runs on Vercel production builds so database setup requires no local API access.
import {neon} from '@neondatabase/serverless';
if(process.env.VERCEL_ENV!=='production'){
 console.log('Automatic database setup is reserved for production deployments.');
}else{
 for(const [key,min] of [['DATABASE_URL',1],['APP_PASSWORD',16],['SESSION_SECRET',32],['UPDATER_SECRET',32]]){
  if(!process.env[key]||process.env[key].length<min)throw Error(`Configure server-only ${key} before deploying production.`);
 }
 await import('./migrate-db.mjs');
 const sql=neon(process.env.DATABASE_URL);
 const marker=await sql.query("SELECT value FROM settings WHERE key='initial_import_complete'");
 if(marker[0]?.value!=='true')await import('./seed-db.mjs');
 else console.log('Initial import already completed; current jobs and schedule status preserved.');
 await import('./seed-discovery.mjs');
 await import('./apply-source-repairs.mjs');
 await import('./seed-major-jobs.mjs');
}

