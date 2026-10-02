import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {createRequire} from 'node:module';
import path from 'node:path';
const temp=fs.mkdtempSync(new URL('../node_modules/.earthwork-security-',import.meta.url));
try{
 for(const name of ['auth','database'])fs.writeFileSync(path.join(temp,name+'.cjs'),ts.transpileModule(fs.readFileSync(new URL('../lib/'+name+'.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText);
 const require=createRequire(import.meta.url),auth=require(path.join(temp,'auth.cjs')),{parameters}=require(path.join(temp,'database.cjs'));
 const previous={APP_PASSWORD:process.env.APP_PASSWORD,SESSION_SECRET:process.env.SESSION_SECRET,UPDATER_SECRET:process.env.UPDATER_SECRET};
 delete process.env.APP_PASSWORD;delete process.env.SESSION_SECRET;delete process.env.UPDATER_SECRET;
 assert(!auth.authorized(new Request('https://example.com/api/jobs')),'Missing configuration must deny access');
 process.env.APP_PASSWORD='test-owner-password-only';process.env.SESSION_SECRET='a'.repeat(48);process.env.UPDATER_SECRET='b'.repeat(48);
 assert(auth.validPassword('test-owner-password-only'));assert(!auth.validPassword('wrong'));
 const session=auth.newSession();assert(auth.validSession(session));assert(!auth.validSession(session+'x'));
 assert(auth.authorized(new Request('https://example.com/api/jobs',{headers:{cookie:`${auth.SESSION_COOKIE}=${session}`}})));
 assert(auth.authorized(new Request('https://example.com/api/sources',{headers:{authorization:'Bearer '+'b'.repeat(48)}})));
 assert(!auth.authorized(new Request('https://example.com/api/jobs',{headers:{authorization:'Bearer wrong'}})));
 process.env.APP_PASSWORD='changed-owner-password';assert(!auth.validSession(session),'Changing password revokes old sessions');
 for(const [key,value] of Object.entries(previous)){if(value===undefined)delete process.env[key];else process.env[key]=value;}
 assert.equal(parameters("SELECT 'why?', 'it''s ?' WHERE id=? AND source_id=?"),"SELECT 'why?', 'it''s ?' WHERE id=$1 AND source_id=$2");
 assert.equal(parameters("UPDATE jobs SET data=(data::jsonb || jsonb_build_object('closed_at',?::text))::text WHERE id=?"),"UPDATE jobs SET data=(data::jsonb || jsonb_build_object('closed_at',$1::text))::text WHERE id=$2");
 console.log('Private access, session revocation and SQL parameters verified.');
}finally{fs.rmSync(temp,{recursive:true,force:true});}
