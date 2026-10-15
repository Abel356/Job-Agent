"""Build a small verified initial sample; scheduled collectors handle full coverage."""
import json,concurrent.futures as cf,xml.etree.ElementTree as ET
from pathlib import Path
import refresh_jobs as m
sources={s['kind']:s for s in json.loads(Path('data/major-employers.json').read_text())}
raw=[]
for country in ['USA','CAN']:
 body,_=m.fetch(f'https://www.amazon.jobs/en/search.json?country={country}&offset=0&result_limit=20&sort=recent')
 for j in json.loads(body)['jobs']:
  url=m.urljoin('https://www.amazon.jobs',j['job_path'])
  raw.append((sources['amazon'],{'title':j['title'],'location':j.get('location',''),'countryCodes':[{'USA':'US','CAN':'CA'}[country]],'descriptionPlain':'\n'.join(m.plain(j.get(k,'')) for k in ['description','basic_qualifications','preferred_qualifications']),'department':j.get('job_category',''),'employmentType':j.get('job_schedule_type',''),'jobUrl':url,'applyUrl':url,'publishedAt':j.get('posted_date',''),'dateBasis':'Posting date (Amazon careers)'}))
body,_=m.fetch('https://www.tesla.com/cua-api/apps/careers/state');data=json.loads(body);locations={}
for region in data['geo']:
 for site in region.get('sites',[]):
  for state in site.get('states',[]):
   for codes in state.get('cities',{}).values():
    for code in codes:locations[str(code)]=site['id']
selected=[]
for country in ['US','CA']:
 listings=[j for j in data['listings'] if locations.get(str(j.get('l')))==country]
 listings.sort(key=lambda j:(not bool(m.re.search(r'intern|new.grad|entry.level|engineer',j['t'],m.re.I)),j['t']))
 selected.extend(listings[:10])
for item in selected:
 try:
  body,_=m.fetch('https://www.tesla.com/cua-api/careers/job/'+item['id']);j=json.loads(body);url=m.urljoin('https://www.tesla.com',j['url'])
  raw.append((sources['tesla'],{'title':j['title'],'location':j.get('location',''),'countryCodes':[j.get('country','')],'descriptionPlain':'\n'.join(m.plain(j.get(k,'')) for k in ['jobDescription','jobResponsibilities','jobRequirements','jobCompensationAndBenefits']),'department':j.get('department',''),'employmentType':j.get('timeType',''),'validThrough':j.get('postUntilDate'),'jobUrl':url,'applyUrl':url}))
 except Exception as e:print('Tesla detail incomplete:',str(e)[:80],flush=True)
body,_=m.fetch(sources['meta']['url']);root=ET.fromstring(body)
urls=[e.text for e in root.iter() if e.tag.endswith('loc') and e.text and '/job_details/' in e.text]
known='https://www.metacareers.com/profile/job_details/1395718268613427/'
for url in list(dict.fromkeys(([known] if known in urls else [])+urls[:6])):
 try:
  body,_=m.fetch(url)
  raw.extend((sources['meta'],m.schema_normalize(j,url)) for d in m.Page(body).schemas for j in m.schemas(d))
 except Exception as e:print('Meta detail incomplete:',str(e)[:80],flush=True)
def verify(item):
 s,j=item
 try:
  r=m.normalize(j,s,{})
  if r and not r.get('closed') and r.get('link_status')=='Page reachable':return r
 except Exception:pass
rows=[]
with cf.ThreadPoolExecutor(max_workers=10) as pool:
 for r in pool.map(verify,raw):
  if r:rows.append(r)
Path('data/major-employer-jobs.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'verified':len(rows),'by_company':{s['name']:sum(j['company']==s['name'] for j in rows) for s in sources.values()}},ensure_ascii=False),flush=True)
