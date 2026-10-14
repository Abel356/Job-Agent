import assert from 'node:assert/strict';
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import ts from 'typescript';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'earthwork-check-'));
for(const name of ['international','reviewed-categories','jobs','job-query']){const input=fs.readFileSync(new URL('../lib/'+name+'.ts',import.meta.url),'utf8');const output=ts.transpileModule(input,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;fs.writeFileSync(path.join(temp,name+'.js'),output);}
const require=createRequire(import.meta.url);
const {decorate,classify}=require(path.join(temp,'jobs.js'));
const {matches,sortJobs,relevance,deadlinePassed}=require(path.join(temp,'job-query.js'));
const snapshot=JSON.parse(gunzipSync(fs.readFileSync(new URL('../data/earthwork-snapshot.json.gz',import.meta.url))));
const jobs=snapshot.jobs.filter(r=>r.active).map(r=>decorate(JSON.parse(r.data)));
const f={query:'',categories:['Finance & Accounting'],province:'All',workplace:'All',seniority:'All',employment:'All',company:null};
assert(jobs.filter(j=>matches(j,f)).length>50,'Finance filter must show actual roles');
assert(jobs.filter(j=>matches(j,{...f,categories:['Customer Service & Success']})).length>70,'Customer filter must show actual roles');
const research=jobs.find(j=>j.position==='Research Internship (Winter 2027)');assert(research.categories.includes('Technology'));
const fuse=jobs.find(j=>j.company==='Fuse'&&j.position.trim()==='Internship');assert(fuse.categories.includes('Technology'));
assert(classify('Product Designer','Engineering').includes('Design'));assert(!classify('Product Designer','Engineering').includes('Technology'));
assert.deepEqual(classify('Senior Compensation Consultant','G&A'),['HR & People']);
assert.deepEqual(classify('Senior Growth Engineer','Growth'),['Technology']);
const software=jobs.find(j=>/software engineer/i.test(j.position));assert(relevance(software,'engineer software')>0,'Multiword search must support any word order');
const titleHit={...software,position:'Data Analyst',company:'Example'},companyHit={...software,position:'Accountant',company:'Data Analyst Company'};
assert.equal(sortJobs([companyHit,titleHit],'Relevance','data analyst')[0],titleHit);
const unknown={...software,posting_date:'',compensation:undefined},older={...software,posting_date:'2025-01-01',compensation:{annual_max_cad:100000}},newer={...software,posting_date:'2026-01-01',compensation:{annual_max_cad:150000}};
assert.equal(sortJobs([unknown,newer,older],'Oldest')[0],older);assert.equal(sortJobs([unknown,older,newer],'Latest')[0],newer);assert.equal(sortJobs([unknown,older,newer],'Highest compensation')[0],newer);
assert(!deadlinePassed('November 4'));assert(!deadlinePassed('2026-10-02',new Date('2026-10-03T02:00:00Z')),'Date-only stays open through Toronto day');assert(deadlinePassed('2026-10-02',new Date('2026-10-03T04:01:00Z')));assert(deadlinePassed('2026-10-02T12:00:00Z',new Date('2026-10-02T12:01:00Z')));
console.log(JSON.stringify({validated:jobs.length,finance:jobs.filter(j=>matches(j,f)).length,customer:jobs.filter(j=>matches(j,{...f,categories:['Customer Service & Success']})).length,technology:jobs.filter(j=>j.categories.includes('Technology')).length,other:jobs.filter(j=>j.categories.includes('Other')).length}));

fs.rmSync(temp,{recursive:true,force:true});

