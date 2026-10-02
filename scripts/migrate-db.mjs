import {readFileSync} from 'node:fs';
import {neon} from '@neondatabase/serverless';
if(!process.env.DATABASE_URL)throw Error('Set DATABASE_URL before migrating.');
const sql=neon(process.env.DATABASE_URL);
const statements=readFileSync(new URL('../db/schema.sql',import.meta.url),'utf8').split(';').map(s=>s.trim()).filter(Boolean);
await sql.transaction(statements.map(s=>sql.query(s)));
console.log('Database schema is ready.');
