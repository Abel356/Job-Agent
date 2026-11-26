import {mkdtempSync,writeFileSync,readFileSync,statSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';

const dir=mkdtempSync(join(tmpdir(),'earthwork-simplify-'));
try{
 const role=(id,company,title,location,sponsorship='Other',active=true)=>({id,company_name:company,title,locations:[location],url:`https://example.com/jobs/${id}`,category:'Software Engineering',sponsorship,active,is_visible:true,date_posted:1795600000});
 const grad=[role('ca','Canada Co','Software Engineer','Toronto, ON'),role('remote','Remote Co','Software Engineer','Remote in USA'),role('sponsor','Sponsor Co','Software Engineer','Seattle, WA','Offers Sponsorship'),role('related','Sponsor Co','Software Engineer','Boston, MA'),role('known','Microsoft','Software Engineer','Redmond, WA'),role('denied','Microsoft','Software Engineer','Seattle, WA','Does Not Offer Sponsorship'),role('wa','Washington Co','Software Engineer','Vancouver, WA'),role('closed','Closed Co','Software Engineer','Toronto, ON','Other',false),...Array.from({length:50},(_,i)=>role(`inactive-${i}`,'Inactive Co','Software Engineer','Toronto, ON','Other',false))];
 const interns=Array.from({length:51},(_,i)=>role(`intern-${i}`,'Intern Co','Software Engineer Intern','London, UK','Other',false));
 writeFileSync(join(dir,'new-grad.json'),JSON.stringify(grad));writeFileSync(join(dir,'internships.json'),JSON.stringify(interns));
 const output=join(dir,'output.json');writeFileSync(output,JSON.stringify({jobs:[]}));
 const run=()=>execFileSync(process.execPath,['scripts/sync-simplify.mjs'],{env:{...process.env,SIMPLIFY_INPUT_DIR:dir,SIMPLIFY_OUTPUT:output},stdio:'pipe'});
 run();const first=JSON.parse(readFileSync(output,'utf8'));
 assert.equal(first.jobs.length,7);
 assert.deepEqual(Object.fromEntries(first.jobs.map(j=>[j.id.split('').length+'|'+j.company+'|'+j.location,j.priority_rank])),{'32|Canada Co|Toronto, ON':0,'32|Remote Co|Remote in USA':1,'32|Sponsor Co|Seattle, WA':2,'32|Sponsor Co|Boston, MA':3,'32|Microsoft|Redmond, WA':3,'32|Microsoft|Seattle, WA':4,'32|Washington Co|Vancouver, WA':4});
 assert.match(first.jobs.find(j=>j.company==='Microsoft'&&j.priority_rank===3).sponsorship_evidence_url,/careers\.microsoft\.com/);
 assert.equal(first.jobs.find(j=>j.company==='Microsoft'&&j.priority_rank===4).sponsorship_evidence_url,'');
 const modified=statSync(output).mtimeMs;run();assert.equal(statSync(output).mtimeMs,modified,'unchanged roles must not trigger a new deployment');
 console.log('Simplify sync verified: active tech roles, Canada priority, US sponsorship signals and exclusions, location disambiguation, no-change behavior.');
}finally{rmSync(dir,{recursive:true,force:true});}
