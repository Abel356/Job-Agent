#!/usr/bin/env node
// Bounded, independent refresh of public employer job boards. No database or AI service.
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';

const input=process.env.EMPLOYER_INPUT_DIR;
const output=process.env.EMPLOYER_OUTPUT||'data/employer-jobs.json';
const prior=JSON.parse(readFileSync(output,'utf8'));
const simplify=JSON.parse(readFileSync('data/simplify-jobs.json','utf8')).jobs;
const snapshot=JSON.parse(readFileSync('data/tech-snapshot.json','utf8')).jobs;
const evidence=JSON.parse(readFileSync('data/us-sponsor-evidence.json','utf8'));
const MAX_SOURCES=100,MAX_JOBS=2500;
const TECH=/\b(?:software|full[ -]?stack|front[ -]?end|back[ -]?end|web|mobile|ios|android|platform|cloud|devops|site reliability|sre|security|cybersecurity|data (?:engineer|scientist|analyst)|machine learning|ml engineer|ai engineer|research (?:engineer|scientist)|product (?:manager|designer|engineer|analyst)|ux|ui|hardware|firmware|embedded|quant(?:itative)? (?:developer|researcher|trader)|solutions? architect|technical product|developer experience|database|infrastructure|qa automation|test automation)\b/i;
const NONTECH=/\b(?:marketing|sales|revenue|business development|go-to-market|partnerships? (?:lead|manager|specialist)|adoption specialist|physical security)\b/i;
const CORE_TECH=/\b(?:software|engineer(?:ing)?|developer|data (?:engineer|scientist|analyst)|solutions? architect|cloud architect|product (?:manager|designer|engineer|analyst))\b/i;
const isTech=title=>TECH.test(title)&&(!NONTECH.test(title)||CORE_TECH.test(title));
const CANADA=/\b(?:Canada|Canadian|Toronto|Vancouver|Montreal|Montréal|Ottawa|Calgary|Edmonton|Waterloo|Kitchener|Mississauga|Winnipeg|Halifax|Québec|Quebec|Ontario|British Columbia|Alberta|Manitoba|Saskatchewan|Nova Scotia|New Brunswick|Newfoundland|Prince Edward Island)\b/i;
const US=/\b(?:United States|USA|U\.S\.|US)\b|,\s*(?:AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC)\b/i;
const stackNames=['TypeScript','JavaScript','React','GraphQL','Node.js','PostgreSQL','Redis','Python','Rust','Java','Kotlin','Swift','AWS','Azure','GCP','Docker','Kubernetes'];
const clean=s=>String(s||'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
const key=url=>{try{const u=new URL(url);if(u.protocol!=='https:'||!u.hostname)return '';return (u.hostname+u.pathname.replace(/\/(?:application|apply)$/i,'')).toLowerCase();}catch{return '';}};
function board(url,name){
 try{
  const u=new URL(url),p=u.pathname.split('/').filter(Boolean),h=u.hostname.toLowerCase();
  if(!p.length||!['https:'].includes(u.protocol))return null;
  let kind,slug=p[0];
  if(h==='jobs.ashbyhq.com')kind='ashby';
  else if(['boards.greenhouse.io','job-boards.greenhouse.io'].includes(h))kind='greenhouse';
  else if(['jobs.lever.co','jobs.eu.lever.co'].includes(h))kind=h.includes('.eu.')?'lever-eu':'lever';
  else if(['jobs.smartrecruiters.com','careers.smartrecruiters.com'].includes(h))kind='smartrecruiters';
  else return null;
  if(!/^[\w.-]{2,80}$/.test(slug)||['embed','j','api'].includes(slug.toLowerCase()))return null;
  const q=encodeURIComponent(slug),id=`${kind}:${slug.toLowerCase()}`;
  const endpoint={ashby:`https://api.ashbyhq.com/posting-api/job-board/${q}?includeCompensation=true`,greenhouse:`https://boards-api.greenhouse.io/v1/boards/${q}/jobs?content=true`,lever:`https://api.lever.co/v0/postings/${q}?mode=json`,'lever-eu':`https://api.eu.lever.co/v0/postings/${q}?mode=json`,smartrecruiters:`https://api.smartrecruiters.com/v1/companies/${q}/postings?limit=100&offset=0`}[kind];
  return {id,kind,slug,name,url:endpoint,board_url:`https://${h}/${slug}`};
 }catch{return null;}
}
function sourceList(){
 if(process.env.EMPLOYER_SOURCES_FILE)return JSON.parse(readFileSync(process.env.EMPLOYER_SOURCES_FILE,'utf8'));
 const candidates=new Map(),counts=new Map();
 for(const job of snapshot){const b=board(job.apply_url,job.company);if(b){counts.set(b.id,(counts.get(b.id)||0)+1);candidates.set(b.id,b);}}
 for(const job of simplify.filter(x=>x.priority_rank<=3)){const b=board(job.apply_url,job.company);if(b){counts.set(b.id,(counts.get(b.id)||0)+3);candidates.set(b.id,b);}}
 for(const entry of JSON.parse(readFileSync('data/employer-sources.json','utf8'))){const b=board(entry.url,entry.name);if(b){counts.set(b.id,(counts.get(b.id)||0)+20);candidates.set(b.id,b);}}
 for(const old of prior.sources||[])if(old.url&&old.id&&!candidates.has(old.id))candidates.set(old.id,old);
 return [...candidates.values()].sort((a,b)=>(counts.get(b.id)||0)-(counts.get(a.id)||0)||a.id.localeCompare(b.id)).slice(0,MAX_SOURCES);
}
async function getJson(url,sourceId){
 if(input)return JSON.parse(readFileSync(`${input}/${sourceId.replace(/[^\w.-]/g,'_')}.json`,'utf8'));
 const r=await fetch(url,{headers:{'User-Agent':'Earthwork-Jobs-Collector/1.0','Accept':'application/json'},signal:AbortSignal.timeout(30000)});
 if(!r.ok)throw Error(`HTTP ${r.status}`);
 const raw=await r.text();if(raw.length>25_000_000)throw Error('Feed exceeds 25 MB');return JSON.parse(raw);
}
async function fetchBoard(s){
 if(s.kind==='smartrecruiters'){
  let jobs=[],offset=0,total=0;
  do{const d=await getJson(s.url.replace(/offset=\d+/,`offset=${offset}`),s.id);if(!Array.isArray(d.content)||!Number.isInteger(d.totalFound))throw Error('Invalid SmartRecruiters feed');jobs.push(...d.content);total=d.totalFound;offset+=d.content.length;if(jobs.length>2000||(!d.content.length&&offset<total))throw Error('SmartRecruiters feed incomplete');}while(offset<total);
  return jobs.map(j=>({title:j.name,location:j.location?.city&&j.location?.country?`${j.location.city}, ${j.location.country}`:j.location?.country||'',url:`https://jobs.smartrecruiters.com/${s.slug}/${j.id}`,posted:j.releasedDate,description:'',department:j.department?.label||''}));
 }
 const d=await getJson(s.url,s.id),rows=s.kind==='ashby'?d.jobs:s.kind==='greenhouse'?d.jobs:d;
 if(!Array.isArray(rows)||rows.length>5000)throw Error('Unexpected feed size or format');
 return rows.map(j=>{
  if(s.kind==='ashby')return {title:j.title,location:[j.location,...(j.secondaryLocations||[]).map(x=>x.location)].filter(Boolean).join('; '),url:j.applyUrl||j.jobUrl,posted:j.publishedAt,description:clean(j.descriptionPlain||j.descriptionHtml),department:j.department||'',remote:j.isRemote,employment:j.employmentType||'',unlisted:j.isListed===false};
  if(s.kind==='greenhouse')return {title:j.title,location:j.location?.name||'',url:j.absolute_url,posted:j.first_published||j.updated_at,description:clean(j.content),department:j.departments?.map(x=>x.name).join(', ')||''};
  return {title:j.text,location:j.categories?.allLocations?.join('; ')||j.categories?.location||'',url:j.hostedUrl,posted:j.createdAt?new Date(j.createdAt).toISOString():'',description:clean(j.descriptionPlain||j.description),department:j.categories?.department||'',remote:j.workplaceType==='remote',employment:j.categories?.commitment||''};
 });
}
function normalize(j,s,checked){
 const title=clean(j.title),location=clean(j.location),description=clean(j.description),url=j.url;
 if(j.unlisted||!isTech(title)||!key(url))return null;
 const safeLocation=location.replace(/\b(?:Vancouver,? (?:WA|Washington)|Ontario,? (?:CA|California|OH|Ohio)|Waterloo,? (?:IA|Iowa)|Ottawa,? (?:IL|Illinois|KS|Kansas)|Toronto,? (?:OH|Ohio))\b/gi,'');
 const canada=CANADA.test(safeLocation),us=US.test(location),remote=Boolean(j.remote)||/\bremote\b/i.test(location);
 if(!canada&&!us)return null;
 const companyEvidence=evidence[s.name.toLowerCase().trim()];
 const offer=/\b(?:visa|h-?1b|work authorization) sponsorship (?:is |will be |may be )?(?:available|provided|offered)\b/i.test(description)&&!/\b(?:no|not|without) (?:visa|work authorization) sponsorship\b/i.test(description);
 const denied=/\b(?:no|not|without) (?:visa|work authorization) sponsorship\b|\bmust (?:already )?be (?:legally )?authorized to work in the (?:US|United States) without sponsorship\b/i.test(description);
 if(!canada&&!remote&&!offer&&!companyEvidence)return null;
 let rank,label,note='Not known as of now',evidenceUrl='';
 if(canada){rank=0;label='Canada role · check your work authorization';}
 else if(denied){rank=4;label='This role states sponsorship is not offered';note='Employer posting states no sponsorship';}
 else if(remote&&us){rank=1;label='Remote US role · confirm Canada eligibility and US work authorization';}
 else if(offer){rank=2;label='Employer posting mentions visa sponsorship · confirm eligibility';note='Employer posting mentions sponsorship';evidenceUrl=url;}
 else{rank=3;label=`${s.name} has published visa sponsorship guidance · this role is unconfirmed`;note=companyEvidence.note;evidenceUrl=companyEvidence.url;}
 const stackSentence=description.match(/\b(?:our )?(?:tech|technology) stack\s*(?:is|includes|:)\s*([^.;]{10,180})/i)?.[1]||'';
 const found=stackNames.filter(name=>new RegExp(`(^|[^a-z])${name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}(?![a-z])`,'i').test(stackSentence));
 const postingDate=/^\d{4}-\d{2}-\d{2}/.test(String(j.posted||''))?String(j.posted).slice(0,10):'';
 return {id:createHash('sha256').update(key(url)).digest('hex').slice(0,32),source_id:s.id,company:s.name,position:title,location,apply_url:url,source_url:url,source_label:`${s.name} careers`,posting_date:postingDate,date_basis:postingDate?'Employer posting date':'',department:j.department||'',employment_type:j.employment||'',workplace:remote?'Remote':'',description:description.slice(0,8000),link_checked_at:checked,link_status:'Employer feed reachable',priority_rank:rank,priority_label:label,sponsorship_note:note,sponsorship_evidence_url:evidenceUrl,tech_stack:found.length>=2?found.join(', ')+' (employer posting)':'Not known as of now'};
}
const selected=sourceList(),previous=new Map((prior.jobs||[]).map(j=>[j.id,j])),results=[];
let next=0;
async function worker(){while(next<selected.length){const s=selected[next++],checked=new Date().toISOString();try{
 const raw=await fetchBoard(s);if(raw.length===0)throw Error('Empty employer feed');
 const found=raw.map(j=>normalize(j,s,checked)).filter(Boolean);
 if(found.length>350)throw Error('Unexpectedly broad tech import');
 results.push({source:{...s,status:'Checked',checked,error:''},jobs:found,unlisted:new Set(raw.filter(j=>j.unlisted).map(j=>key(j.url)))});
 }catch(e){results.push({source:{...s,status:'Check incomplete',checked,error:String(e.message||e).slice(0,140)},jobs:null});}}}
await Promise.all(Array.from({length:Math.min(6,selected.length)},worker));
const finalSources=results.map(r=>r.source).sort((a,b)=>a.name.localeCompare(b.name));
const jobs=[];
for(const result of results){const seen=new Set();if(result.jobs){for(const job of result.jobs){seen.add(job.id);jobs.push({...job,missing_count:0});}}
 for(const old of previous.values())if(old.source_id===result.source.id){if(!isTech(old.position)||result.unlisted?.has(key(old.apply_url)))continue;if(!result.jobs){jobs.push(old);continue;}if(seen.has(old.id))continue;const missed=(old.missing_count||0)+1;if(missed<2)jobs.push({...old,missing_count:missed});}
}
if(jobs.length>MAX_JOBS)throw Error(`Refusing employer import of ${jobs.length} jobs`);
if((prior.jobs||[]).length>50&&jobs.length<(prior.jobs.length*0.7))throw Error('Refusing sudden loss of employer jobs');
if(selected.length&&results.filter(r=>r.jobs).length<Math.ceil(selected.length*0.3))throw Error('Too many employer feeds failed; retaining prior data');
jobs.sort((a,b)=>a.priority_rank-b.priority_rank||b.posting_date.localeCompare(a.posting_date)||a.id.localeCompare(b.id));
const comparable=x=>JSON.stringify(x.jobs.map(({link_checked_at,...j})=>j));
if(comparable(prior)===comparable({jobs})&&JSON.stringify((prior.sources||[]).map(s=>[s.id,s.status]))===JSON.stringify(finalSources.map(s=>[s.id,s.status]))){console.log(`Employer roles unchanged; ${jobs.length} retained.`);process.exit(0);}
writeFileSync(output,JSON.stringify({checked_at:new Date().toISOString(),sources:finalSources,jobs})+'\n');
console.log(`Employer feeds: ${results.filter(r=>r.jobs).length}/${selected.length} checked, ${jobs.length} tech roles, ${jobs.filter(j=>j.priority_rank===0).length} Canada.`);
