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
 const {profileStorageKey,newProfileSalt,readProfileSalt,deriveProfileKey,encryptProfile,decryptProfile}=require(join(temp,'profile-vault.cjs'));
 const aliceId=await profileStorageKey('Alice'),bobId=await profileStorageKey('Bob');
 assert.equal(aliceId,await profileStorageKey(' ALICE '));
 assert.notEqual(aliceId,bobId);
 assert(!aliceId.includes('alice'));
 const salt=newProfileSalt(),aliceKey=await deriveProfileKey('long unique passphrase',salt),wrongKey=await deriveProfileKey('another long passphrase',salt);
 const alice=emptyProfile();alice.skills=['Python'];
 const saved=await encryptProfile(alice,aliceId,aliceKey,salt);
 assert.equal(readProfileSalt(saved),salt);
 assert(!saved.includes('Python'),'Saved profile must not be readable in browser storage');
 assert.deepEqual(await decryptProfile(saved,aliceId,aliceKey),alice);
 assert.equal(await decryptProfile(saved,aliceId,wrongKey),null,'Wrong passphrase must fail');
 assert.equal(await decryptProfile(saved,bobId,aliceKey),null,'Another profile cannot decrypt this one');
 assert.equal(await decryptProfile('{"version":2,"salt":"bad","iv":"bad","data":"bad"}',aliceId,aliceKey),null);
 assert.equal(readProfileSalt('{"version":2,"salt":"bad"}'),null);
 console.log('Passphrase profile encryption, local account isolation, and corrupt-data handling verified.');
}finally{rmSync(temp,{recursive:true,force:true});}
