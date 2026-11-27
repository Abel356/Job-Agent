import {mkdtempSync,writeFileSync,readFileSync,rmSync,unlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';

const dir=mkdtempSync(join(tmpdir(),'earthwork-employers-'));
const output=join(dir,'output.json'),sources=join(dir,'sources.json');
const ca={id:'ashby:canadaco',kind:'ashby',name:'CanadaCo',url:'https://api.ashbyhq.com/posting-api/job-board/canadaco',board_url:'https://jobs.ashbyhq.com/canadaco'};
const us={id:'greenhouse:usco',kind:'greenhouse',name:'USCo',url:'https://boards-api.greenhouse.io/v1/boards/usco/jobs?content=true',board_url:'https://job-boards.greenhouse.io/usco'};
const fixture=(id,data)=>writeFileSync(join(dir,id.replace(/[^\w.-]/g,'_')+'.json'),JSON.stringify(data));
const run=()=>execFileSync(process.execPath,['scripts/sync-employers.mjs'],{env:{...process.env,EMPLOYER_INPUT_DIR:dir,EMPLOYER_SOURCES_FILE:sources,EMPLOYER_OUTPUT:output},stdio:'pipe'});
const read=()=>JSON.parse(readFileSync(output,'utf8'));
try{
 writeFileSync(output,JSON.stringify({checked_at:'',sources:[],jobs:[]}));writeFileSync(sources,JSON.stringify([ca,us]));
 fixture(ca.id,{jobs:[{title:'Software Engineer',location:'Toronto, Ontario',jobUrl:'https://jobs.ashbyhq.com/canadaco/1',descriptionPlain:'Our tech stack includes React, TypeScript and PostgreSQL.'},{title:'Sales Manager',location:'Toronto, Ontario',jobUrl:'https://jobs.ashbyhq.com/canadaco/2'},{title:'Platform Marketing Lead',location:'Toronto, Ontario',jobUrl:'https://jobs.ashbyhq.com/canadaco/5'},{title:'Software Engineer',location:'Toronto, Ontario',jobUrl:'https://jobs.ashbyhq.com/canadaco/6',isListed:false}]});
 fixture(us.id,{jobs:[{title:'Data Scientist',location:{name:'Remote, United States'},absolute_url:'https://job-boards.greenhouse.io/usco/jobs/3',content:'Data science role.'},{title:'Account Executive',location:{name:'Remote, United States'},absolute_url:'https://job-boards.greenhouse.io/usco/jobs/4'}]});
 run();let state=read();assert.equal(state.jobs.length,2);assert.deepEqual(state.jobs.map(j=>j.priority_rank).sort(),[0,1]);assert.match(state.jobs.find(j=>j.company==='CanadaCo').tech_stack,/React/);assert(!state.jobs.some(j=>j.position==='Sales Manager'||j.position==='Platform Marketing Lead'));
 unlinkSync(join(dir,'greenhouse_usco.json'));run();state=read();assert.equal(state.jobs.length,2,'failed source must retain prior jobs');assert.equal(state.sources.find(s=>s.id===us.id).status,'Check incomplete');
 fixture(us.id,{jobs:[{title:'Account Executive',location:{name:'Remote, United States'},absolute_url:'https://job-boards.greenhouse.io/usco/jobs/4'}]});run();state=read();assert.equal(state.jobs.length,2);assert.equal(state.jobs.find(j=>j.company==='USCo').missing_count,1);
 run();state=read();assert.equal(state.jobs.length,1,'role must close after two successful absences');
 fixture(ca.id,{jobs:[{title:'Software Engineer',location:'Toronto, Ontario',jobUrl:'https://jobs.ashbyhq.com/canadaco/1',isListed:false}]});run();state=read();assert.equal(state.jobs.length,0,'unlisted employer roles must be removed immediately');
 console.log('Employer sync verified: tech filter, Canada/remote US ranking, stack evidence, failed-source retention, two-check closure.');
}finally{rmSync(dir,{recursive:true,force:true});}
