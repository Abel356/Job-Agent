// Only registered company/ATS sources may be fetched. Site credentials never leave this origin.
const ATS=new Set(['api.ashbyhq.com','jobs.ashbyhq.com','boards-api.greenhouse.io','boards.greenhouse.io','job-boards.greenhouse.io','api.lever.co','api.eu.lever.co','jobs.lever.co','jobs.eu.lever.co']);
function allowed(url:URL,source:any){
 if(!['https:','http:'].includes(url.protocol)||url.username||url.password||(url.port&&url.port!=='443'&&url.port!=='80'))return false;
 const h=url.hostname.toLowerCase();if(ATS.has(h))return true;
 if(h==='localhost'||h.endsWith('.local')||/^\d+(?:\.\d+){3}$/.test(h)||h.includes(':'))return false;
 return ['url','website','careers_url','board_url'].some(k=>{try{const host=new URL(source[k]).hostname.replace(/^www\./,'');return h.replace(/^www\./,'')===host||h.endsWith('.'+host);}catch{return false;}});
}
export async function fetchSource(raw:string,source:any,payload?:unknown){
 let url=new URL(raw);
 if(payload!==undefined&&!(url.hostname.endsWith('.myworkdayjobs.com')&&/^\/wday\/cxs\/[^/]+\/[^/]+\/jobs$/.test(url.pathname)))throw Error('Only Workday public job searches accept a request body');
 for(let i=0;i<5;i++){
  if(!allowed(url,source))return {status:403,body:'Source domain is not registered for this company',url:url.href};
  const r=await fetch(url,{redirect:'manual',method:payload===undefined?'GET':'POST',body:payload===undefined?undefined:JSON.stringify(payload),headers:{'Content-Type':'application/json','User-Agent':'EarthworkJobs/1.0 (daily careers index)','Accept':'application/json,text/html;q=0.9,*/*;q=0.8'},signal:AbortSignal.timeout(18000)});
  if([301,302,303,307,308].includes(r.status)&&r.headers.get('location')){url=new URL(r.headers.get('location')!,url);continue;}
  const limit=['api.ashbyhq.com','boards-api.greenhouse.io','api.lever.co','api.eu.lever.co'].includes(url.hostname)?25000000:5000000;
  if(Number(r.headers.get('content-length')||0)>limit)throw Error('Source exceeds safe response size');
  const reader=r.body?.getReader();const chunks:Uint8Array[]=[];let size=0;
  if(reader){while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>limit){await reader.cancel();throw Error('Source exceeds safe response size');}chunks.push(part.value);}}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  let body=new TextDecoder().decode(bytes);
  // Collection needs visible content, links and JobPosting metadata, not bundled application code.
  if((r.headers.get('content-type')||'').includes('text/html'))body=body.replace(/<script\b([^>]*)>[\s\S]*?<\/script>/gi,(whole,attrs)=>/application\/ld\+json/i.test(attrs)||(source.kind==='speedrun-company'&&/__NEXT_DATA__/.test(attrs))?whole:'').replace(/<(?:style|svg)\b[^>]*>[\s\S]*?<\/(?:style|svg)>/gi,'').replace(/<!--[^]*?-->/g,'');
  return {status:r.status,body,url:url.href};
 }
 throw Error('Too many redirects');
}

