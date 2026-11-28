import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import ts from 'typescript';

const temp=mkdtempSync(join(tmpdir(),'earthwork-profile-vault-'));
try{
 for(const name of ['matching','profile-vault']){
  const source=readFileSync(new URL(`../lib/${name}.ts`,import.meta.url),'utf8');
  const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText.replace('require("./matching")','require("./matching.cjs")');
  writeFileSync(join(temp,`${name}.cjs`),output);
 }
 const require=createRequire(import.meta.url);
 const {emptyProfile}=require(join(temp,'matching.cjs'));
 const {encryptProfile,decryptProfile,profileStorageKey}=require(join(temp,'profile-vault.cjs'));
 const alice=emptyProfile();alice.skills=['Python'];
 const key=Buffer.alloc(32,7).toString('base64');
 const blob=await encryptProfile(alice,'google-alice',key);
 assert(!blob.includes('Python'),'Saved profile must not be readable in browser storage');
 assert.deepEqual(await decryptProfile(blob,'google-alice',key),alice);
 assert.equal(await decryptProfile(blob,'google-bob',key),null,'Other accounts cannot decrypt a profile');
 assert.equal(await decryptProfile(blob,'google-alice',Buffer.alloc(32,8).toString('base64')),null,'Wrong key cannot decrypt a profile');
 assert.notEqual(profileStorageKey('google-alice'),profileStorageKey('google-bob'));
 assert.equal(await decryptProfile('{"version":2,"iv":"bad","data":"bad"}','google-alice',key),null);
 console.log('Encrypted browser profile, account isolation, and corrupt-data handling verified.');
}finally{rmSync(temp,{recursive:true,force:true});}
