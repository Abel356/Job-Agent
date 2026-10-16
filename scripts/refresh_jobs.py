#!/usr/bin/env python3
"""Scheduled company job collection. Standard library only; no AI services."""
import argparse, concurrent.futures as cf, datetime as dt, hashlib, html, json, os, re, sys, time, threading, uuid
from pathlib import Path
from contextlib import contextmanager
from html.parser import HTMLParser
from urllib.parse import urlsplit, urljoin, quote, unquote, parse_qs
from urllib.request import Request, urlopen, build_opener, HTTPRedirectHandler
from urllib.error import HTTPError
from zoneinfo import ZoneInfo
PUBLIC_LIMIT=threading.BoundedSemaphore(24)
FX={"rates":{"CAD":1},"date":""}
class SourceFailure(Exception):
    def __init__(self,status,message):self.status=status;super().__init__(f"HTTP {status}: {message[:180]}")
ORIGIN=os.environ.get('SITE_ORIGIN','').rstrip('/')
TOKEN=os.environ.get('UPDATER_SECRET','')
DIRECT=os.environ.get('PUBLIC_FETCH_MODE','direct')=='direct'
NOW=lambda:dt.datetime.now(dt.timezone.utc).isoformat()
class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs):return None

def api(path,data=None):
    if not ORIGIN.startswith(('https://','http://127.0.0.1')):raise ValueError('SITE_ORIGIN must be the deployed Earthwork origin')
    payload=json.dumps(data).encode() if data is not None else None
    headers={'Content-Type':'application/json'}
    if TOKEN:headers['Authorization']='Bearer '+TOKEN
    if os.environ.get('VERCEL_AUTOMATION_BYPASS_SECRET'):headers['x-vercel-protection-bypass']=os.environ['VERCEL_AUTOMATION_BYPASS_SECRET']
    request=Request(ORIGIN+'/api/'+path,data=payload,headers=headers)
    attempts=3 if data is None or path in ['import','settings','category','finish-run','expire'] or (path=='start-run' and data.get('run_id')) else 1
    for attempt in range(attempts):
        try:
            with build_opener(NoRedirect()).open(request,timeout=90) as r:return json.load(r)
        except HTTPError as e:
            if e.code not in [429,500,502,503,504] or attempt==attempts-1:raise
        except OSError:
            if attempt==attempts-1:raise
        time.sleep(1+attempt)

def fetch(url,data=None,source=None):
    if not url.startswith(('http://','https://')):raise ValueError('Invalid public source URL')
    if ORIGIN and source and not DIRECT:
        with PUBLIC_LIMIT:
            result=api('public-fetch',{'source_id':source['id'],'url':url,**({'request_data':data} if data is not None else {})})
        if result['status']!=200:raise SourceFailure(result['status'],visible_text(result.get('body','')))
        return result['body'],result['url']
    payload=json.dumps(data).encode() if data is not None else None
    headers={'User-Agent':'EarthworkJobs/1.0','Accept':'application/json,text/html,text/plain'}
    if payload is not None:headers['Content-Type']='application/json'
    with PUBLIC_LIMIT:
        with urlopen(Request(url,data=payload,headers=headers),timeout=18) as r:
            limit=25_000_000 if urlsplit(url).hostname in ['api.ashbyhq.com','boards-api.greenhouse.io','api.lever.co','api.eu.lever.co'] else 5_000_000
            body=r.read(limit+1)
            if len(body)>limit:raise ValueError(f'Source exceeds the {limit//1_000_000} MB limit')
            return body.decode('utf-8',errors='replace'),r.geturl()

def ident(url):
    p=urlsplit(url);path=p.path.rstrip('/').removesuffix('/application').removesuffix('/apply')
    if p.hostname=='jobs.ashbyhq.com':path=path.lower()
    return hashlib.sha256((p.netloc.lower()+path).encode()).hexdigest()[:32]

def plain(s):return re.sub(r'[ \t]+',' ',html.unescape(re.sub(r'<[^>]*>',' ',s or ''))).strip()
def visible_text(s):return plain(re.sub(r'<(script|style)\b[^>]*>[\s\S]*?</\1>','',s or '',flags=re.I))
class Page(HTMLParser):
    def __init__(self,body):
        super().__init__();self.links=[];self.link_text={};self.anchor=None;self.schemas=[];self.ld=False;self.buf='';self.feed(body)
    def handle_starttag(self,tag,attrs):
        a=dict(attrs)
        if tag=='a' and a.get('href'):self.links.append(a['href']);self.anchor=a['href']
        if tag=='script' and a.get('type')=='application/ld+json':self.ld=True;self.buf=''
    def handle_data(self,data):
        if self.ld:self.buf+=data
        if self.anchor:self.link_text[self.anchor]=self.link_text.get(self.anchor,'')+' '+data
    def handle_endtag(self,tag):
        if tag=='a':self.anchor=None
        if tag=='script' and self.ld:
            try:self.schemas.append(json.loads(self.buf))
            except:pass
            self.ld=False

def schemas(x):
    if isinstance(x,list):
        for v in x:yield from schemas(v)
    elif isinstance(x,dict):
        if x.get('@type')=='JobPosting' or 'JobPosting' in (x.get('@type') or []) :yield x
        for key in ['@graph','itemListElement','item']:
            if key in x:yield from schemas(x[key])
CANADA=re.compile(r'\bCanada\b|\bCanadian\b|\bToronto\b|\bVancouver\b|\bMontr[eé]al\b|\bOttawa\b|\bCalgary\b|\bEdmonton\b|\bWaterloo\b|\bKitchener\b|\bMississauga\b|\bWinnipeg\b|\bHalifax\b|\bQu[eé]bec\b|\bOntario\b|\bBritish Columbia\b|\bAlberta\b|\bSaskatchewan\b|\bManitoba\b|\bNova Scotia\b|\bNew Brunswick\b|\bNewfoundland\b|\bPrince Edward Island\b',re.I)
US_CITY=re.compile(r'\b(?:Vancouver\s*,?\s*(?:WA\b|Washington\b)|Ontario\s*,?\s*(?:CA\b|California\b|Ohio\b|OH\b)|Waterloo\s*,?\s*(?:IA\b|Iowa\b|Illinois\b|IL\b|Wisconsin\b|WI\b|New York\b|NY\b|Belgium\b)|Ottawa\s*,?\s*(?:Illinois\b|IL\b|Kansas\b|KS\b)|Halifax\s*,?\s*(?:Virginia\b|VA\b)|Toronto\s*,?\s*(?:Ohio\b|OH\b))',re.I)
ELIGIBLE=re.compile(r'(?:this (?:role|position|job)|(?:you|candidates|applicants) (?:must|should|can|may|will|are|need to)).{0,70}(?:based|located|remote|resid|living|live|anywhere|authorized to work|eligible|open to|available).{0,70}\bCanada\b|we (?:are hiring|hire|welcome applicants).{0,110}\bCanada\b|(?:open|available) to (?:applicants|candidates).{0,90}\bCanada\b|(?:remote|location)\s*[:\-].{0,80}\bCanada\b|(?:remote (?:within|from|in)|based in|residing in|eligible to work in)\s+(?:the (?:US|United States)\s+(?:or|and)\s+)?Canada\b',re.I)
DEADLINE=re.compile(r'application(?:s)?\s+(?:deadline|close|closing|must\s+be\s+(?:received|submitted)|(?:are\s+)?due|will\s+be\s+accepted\s+until)|closing\s+date|apply\s+(?:by|before|no later than)',re.I)
DATE=re.compile(r'\b\d{4}-\d{2}-\d{2}\b|\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+\d{1,2}(?:st|nd|rd|th)?(?:\s*,?\s*\d{4})?\b',re.I)

def eligible(j):
    secondary=j.get('secondaryLocations') or []
    countries=[((j.get('address') or {}).get('postalAddress') or {}).get('addressCountry','')]+[(v.get('address') or {}).get('addressCountry','') for v in secondary]
    if any(str(c).lower() in ['ca','can','canada'] for c in countries):return 'Canada in structured location'
    location=US_CITY.sub('', ' | '.join([j.get('location') or '']+[x.get('location') or '' for x in secondary]))
    if CANADA.search(location):return 'Canada in listed location'
    if j.get('isRemote') or str(j.get('workplaceType','')).lower()=='remote' or re.search('remote',location,re.I):
        for sentence in re.split(r'(?<=[.!?])\s+|\n',j.get('descriptionPlain','')):
            if ELIGIBLE.search(sentence) and not re.search(r'(?:not|except|excluding|outside|unable).{0,25}Canada|offsites|customer events|benefits|parental|offices (?:in|across)|for employees based|regulatory projects|markets (?:in|across)',sentence,re.I):return 'Remote Canada stated: '+sentence[:350]
    return ''

def deadline_iso(value):
    value=(value or '').strip()
    if re.fullmatch(r'\d{4}-\d{2}-\d{2}',value):
        try:dt.date.fromisoformat(value);return value
        except ValueError:return ''
    if re.fullmatch(r'\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:?\d{2})',value):
        try:dt.datetime.fromisoformat(value.replace('Z','+00:00'));return value
        except ValueError:return ''
    if not re.search(r'\b20\d{2}\b',value):return ''
    value=re.sub(r'(\d)(st|nd|rd|th)\b',r'\1',value,flags=re.I).replace(',','').replace('.','')
    for fmt in ['%B %d %Y','%b %d %Y','%d %B %Y','%d %b %Y']:
        try:return dt.datetime.strptime(value,fmt).date().isoformat()
        except ValueError:pass
    return ''

def compensation(j,desc):
    c=j.get('compensation') or {};components=[]
    for tier in c.get('compensationTiers',[]):
        for x in tier.get('components',[]):
            if x.get('compensationType')=='Salary':components.append(x)
    if not components:components=[x for x in c.get('summaryComponents',[]) if x.get('compensationType')=='Salary']
    if j.get('salaryRange'):
        x=j['salaryRange'];components.append({'minValue':x.get('min'),'maxValue':x.get('max'),'currencyCode':x.get('currency'),'interval':x.get('interval'),'compensationType':'Salary'})
    bs=j.get('baseSalary') or {}
    if isinstance(bs,dict) and bs.get('currency'):
        v=bs.get('value') or {};v=v if isinstance(v,dict) else {'value':v};components.append({'minValue':v.get('minValue',v.get('value')),'maxValue':v.get('maxValue',v.get('value')),'currencyCode':bs['currency'],'interval':v.get('unitText','')})
    cad=[x for x in components if x.get('currencyCode')=='CAD']
    if cad:components=cad
    # Read explicit currency ranges from salary wording; never infer currency from a dollar sign.
    if not components:
        pat=r'(?:(CAD|USD|EUR|GBP)\s*\$?\s*([\d,]+(?:\.\d+)?)\s*([kK]?)\s*[-–—]\s*\$?\s*([\d,]+(?:\.\d+)?)\s*([kK]?)|\$\s*([\d,]+(?:\.\d+)?)\s*([kK]?)\s*[-–—]\s*\$?\s*([\d,]+(?:\.\d+)?)\s*([kK]?)\s*(CAD|USD|EUR|GBP))'
        for m in re.finditer(pat,desc):
            a,b,k,d,k2,a2,k3,b2,k4,c2=m.groups();currency=a or c2;minimum=float((b or a2).replace(',',''))*(1000 if k or k3 else 1);maximum=float((d or b2).replace(',',''))*(1000 if k2 or k4 else 1)
            context=desc[max(0,m.start()-180):m.end()+180]
            if not re.search(r'salary|compensation|base pay|pay range|annual',context,re.I):continue
            interval='HOUR' if re.search(r'per hour|hourly|/hour|/hr',context,re.I) else 'YEAR' if maximum>=10000 or re.search(r'annual|year',context,re.I) else ''
            components.append({'minValue':minimum,'maxValue':maximum,'currencyCode':currency,'interval':interval,'summary':m.group()})
    if not components:
        summary=c.get('compensationTierSummary') or j.get('salaryDescription')
        return {'summary':summary[:500],'basis':'Employer wording; amount not comparable'} if summary else None
    x=max(components,key=lambda v:float(v.get('maxValue') or v.get('minValue') or 0));currency=x.get('currencyCode') or '';lo=x.get('minValue');hi=x.get('maxValue') or lo;interval=x.get('interval') or ''
    summary=f"{currency} {lo:,.0f}–{hi:,.0f} / {interval.lower()}" if isinstance(lo,(int,float)) and isinstance(hi,(int,float)) else c.get('compensationTierSummary','Compensation stated')
    out={'summary':summary,'currency':currency,'min':lo,'max':hi,'interval':interval,'basis':'Published salary range; upper end of employer range; check commission terms'}
    rate=FX['rates'].get(currency)
    if isinstance(hi,(int,float)) and rate and re.search(r'year|annual',interval,re.I):out.update(annual_max_cad=round(hi*rate),fx_date=FX['date'] if currency!='CAD' else '')
    return out

def normalize(j,s,existing):
    url=j.get('applyUrl') or j.get('jobUrl') or ''
    if not url.startswith(('http://','https://')):return None
    if not str(j.get('title') or '').strip():return None
    reason=eligible(j)
    key=ident(url);old=existing.get(key,{})
    desc=plain(j.get('descriptionPlain') or j.get('descriptionHtml') or '')
    digest=hashlib.sha256(desc.encode()).hexdigest()
    dl,evidence='',''
    for m in DEADLINE.finditer(desc):
        d=DATE.search(desc[m.end():m.end()+140])
        if d:dl=d.group();evidence=desc[max(0,m.start()-30):m.end()+200];break
    if j.get('validThrough'):dl=j['validThrough'];evidence='Deadline in official posting metadata'
    row={'id':key,'source_id':s['id'],'company':j.get('employerName') or s['name'],'position':str(j.get('title') or '').strip(),'apply_url':url,'source_url':j.get('jobUrl') or url,'location':j.get('location') or '', 'other_locations':'; '.join(x.get('location','') for x in j.get('secondaryLocations',[])),'workplace':j.get('workplaceType') or ('Remote' if j.get('isRemote') else ''),'employment_type':j.get('employmentType') or '', 'department':j.get('department') or '', 'posting_date':j.get('publishedAt') or old.get('posting_date',''),'date_basis':j.get('dateBasis') or ('Last published (Ashby)' if s['kind']=='ashby' and j.get('publishedAt') else old.get('date_basis','')),'deadline':dl or old.get('deadline',''),'deadline_evidence':evidence or old.get('deadline_evidence',''),'canada_evidence':reason,'description':desc[:24000],'description_hash':digest,'link_checked_at':old.get('link_checked_at',''),'compensation':compensation(j,desc) or old.get('compensation'),'listing_type':'Talent pool / future opening' if re.search(r'future (?:opening|opportunit)|general (?:application|interest)|open application|interest form|refer them|apply anyway|talent (?:pool|network)|veterans @',j.get('title',''),re.I) else 'Open role'}
    # Preserve actual posting dates; a feed's republication timestamp is different.
    if old.get('date_basis','').startswith('Posting date') or old.get('date_basis','').startswith('First published'):
        row['posting_date']=old['posting_date'];row['date_basis']=old['date_basis']
    row['deadline_iso']=deadline_iso(row['deadline'])
    row['country_codes']=[c for c in [((j.get('address') or {}).get('postalAddress') or {}).get('addressCountry','')]+j.get('countryCodes',[])+[(v.get('address') or {}).get('addressCountry','') for v in j.get('secondaryLocations',[])] if isinstance(c,str) and c]
    row['company_groups']=(['Fortune 500'] if s.get('fortune_year') else [])+(['a16z Speedrun'] if s.get('portfolio_url') else [])
    row['link_status']='Verification pending';row['link_error']=''
    try:
        body,final=fetch(url,source=s);page=Page(body)
        # Only visible page text can confirm closure; embedded scripts can contain generic errors.
        visible=plain(re.sub(r'<script\b[^>]*>[\s\S]*?</script>','',body,flags=re.I))
        if re.search(r'(?:this|the) (?:job|position|posting) (?:is no longer (?:available|accepting applications)|has been (?:closed|filled|removed))|no longer accepting applications|(?:job|position|posting) (?:not found|is closed)',visible[:20000],re.I):
            row['closed']=True;return row
        expected=urlsplit(url).path.rstrip('/').removesuffix('/application').removesuffix('/apply')
        actual=urlsplit(final).path.rstrip('/').removesuffix('/application').removesuffix('/apply')
        if len(expected.split('/'))>=3 and len(actual.split('/'))<3:raise ValueError('Application redirects to a general board')
        for data in page.schemas:
            for item in schemas(data):
                if item.get('datePosted'):row['posting_date']=item['datePosted'];row['date_basis']='Posting date (application page metadata)'
                if item.get('validThrough'):row['deadline']=item['validThrough'];row['deadline_evidence']='Deadline in application page metadata';row['deadline_iso']=deadline_iso(row['deadline'])
                if not row['compensation']:row['compensation']=compensation({'baseSalary':item.get('baseSalary')},desc)
        row['apply_url']=final;row['link_checked_at']=NOW();row['link_status']='Page reachable'
    except Exception as e:
        row['link_status']='Check incomplete';row['link_error']=str(e)[:200]
    return row

def feed_source(url,name):
    p=urlsplit(url);parts=[unquote(x) for x in p.path.split('/') if x];h=(p.hostname or '').lower()
    if p.scheme not in ['https','http'] or p.username or p.password:return None
    if h in ['amazon.jobs','www.amazon.jobs']:return {'id':'major:amazon','kind':'amazon','name':'Amazon','url':'https://www.amazon.jobs/en/search','board_url':'https://www.amazon.jobs/en/search','scope':'US and Canada'}
    if h in ['tesla.com','www.tesla.com'] and '/careers' in p.path:return {'id':'major:tesla','kind':'tesla','name':'Tesla','url':'https://www.tesla.com/careers/search','board_url':'https://www.tesla.com/careers/search','scope':'US and Canada'}
    if h in ['metacareers.com','www.metacareers.com']:return {'id':'major:meta','kind':'meta','name':'Meta','url':'https://www.metacareers.com/jobsearch/sitemap.xml','board_url':'https://www.metacareers.com/jobs/','scope':'All public sitemap postings'}
    if not parts:return None
    if h in ['jobs.smartrecruiters.com','careers.smartrecruiters.com']:
        slug=parts[0]
        if not re.fullmatch(r'[A-Za-z0-9_-]+',slug):return None
        return {'id':'smartrecruiters:'+slug.lower(),'kind':'smartrecruiters','slug':slug,'name':name,'url':f'https://api.smartrecruiters.com/v1/companies/{quote(slug,safe="")}/postings','board_url':f'https://careers.smartrecruiters.com/{slug}'}
    if h=='apply.workable.com' and parts[0] not in ['j','api']:
        slug=parts[0];return {'id':'workable:'+slug.lower(),'kind':'workable','slug':slug,'name':name,'url':f'https://apply.workable.com/{slug}/llms.txt','board_url':f'https://apply.workable.com/{slug}/'}
    if h.endswith('.myworkdayjobs.com'):
        parts=[x for x in parts if not re.fullmatch(r'[a-z]{2}-[A-Z]{2}',x)];slug=parts[0];return {'id':'workday:'+h.split('.')[0]+':'+slug.lower(),'kind':'workday','slug':slug,'name':name,'url':f'https://{h}/{slug}','board_url':f'https://{h}/{slug}'}
    if h=='jobs.ashbyhq.com':kind,slug='ashby',parts[0]
    elif h in ['boards.greenhouse.io','job-boards.greenhouse.io']:kind,slug='greenhouse',parts[0]
    elif h in ['jobs.lever.co','jobs.eu.lever.co']:kind,slug=('lever-eu' if '.eu.' in h else 'lever'),parts[0]
    else:return None
    if slug in ['embed','j']:return None
    q=quote(slug,safe='')
    feed={'ashby':f'https://api.ashbyhq.com/posting-api/job-board/{q}','greenhouse':f'https://boards-api.greenhouse.io/v1/boards/{q}/jobs?content=true','lever':f'https://api.lever.co/v0/postings/{q}?mode=json','lever-eu':f'https://api.eu.lever.co/v0/postings/{q}?mode=json'}[kind]
    return {'id':kind+':'+slug.lower(),'kind':kind,'slug':slug,'name':name,'url':feed,'board_url':url}

def schema_normalize(j,url):
    ls=j.get('jobLocation',[]);ls=ls if isinstance(ls,list) else [ls];names=[]
    for x in ls:
        if isinstance(x,dict):
            a=x.get('address') or {};a=a if isinstance(a,dict) else {};names.append(', '.join(str(a[k]) for k in ['addressLocality','addressRegion','addressCountry'] if a.get(k)))
    es=j.get('applicantLocationRequirements',[]);es=es if isinstance(es,list) else [es]
    names.extend(x.get('name','') for x in es if isinstance(x,dict))
    org=j.get('hiringOrganization') or {};org=org if isinstance(org,dict) else {}
    codes=[]
    for x in ls:
        a=x.get('address',{}) if isinstance(x,dict) else {}
        c=a.get('addressCountry') if isinstance(a,dict) else None
        if isinstance(c,dict):c=c.get('name','')
        if c:codes.append(c)
    return {'title':j.get('title'),'location':' | '.join(names),'countryCodes':codes,'employerName':org.get('name'),'employerWebsite':org.get('url') or org.get('sameAs'),'descriptionPlain':plain(j.get('description','')),'isRemote':j.get('jobLocationType')=='TELECOMMUTE','workplaceType':'Remote' if j.get('jobLocationType')=='TELECOMMUTE' else '', 'publishedAt':j.get('datePosted'),'dateBasis':'Posting date (website metadata)','validThrough':j.get('validThrough'),'employmentType':j.get('employmentType'),'jobUrl':urljoin(url,j.get('url') or url),'applyUrl':urljoin(url,j.get('url') or url),'baseSalary':j.get('baseSalary')}

SPEEDRUN={'id':'portfolio:speedrun','kind':'speedrun','name':'a16z Speedrun portfolio','url':'https://speedrun.a16z.com/companies'}
EMPLOYER_INDEXES=[
    {'id':'discovery:simplify-internships','kind':'employer-index','name':'Simplify / Pitt CSC employer discovery','url':'https://raw.githubusercontent.com/SimplifyJobs/Summer2027-Internships/dev/README.md','board_url':'https://github.com/SimplifyJobs/Summer2027-Internships'},
    {'id':'discovery:simplify-new-grad','kind':'employer-index','name':'Simplify new-grad employer discovery','url':'https://raw.githubusercontent.com/SimplifyJobs/New-Grad-Positions/dev/README.md','board_url':'https://github.com/SimplifyJobs/New-Grad-Positions'},
]

def discover_employer_boards(body,source):
    """Only employer names and supported ATS URLs. Never import third-party job records."""
    found={};company='';rows=re.findall(r'<tr\b[^>]*>(.*?)</tr>',body,re.I|re.S)
    if not rows:raise ValueError('Employer directory format changed; no table rows found')
    for row in rows:
        cells=re.findall(r'<td\b[^>]*>(.*?)</td>',row,re.I|re.S)
        if not cells:continue
        name=visible_text(cells[0]).strip().strip('🔥').strip()
        if name and name not in ['↳','↪','→']:company=name[:150]
        if not company:continue
        for url in Page(row).links:
            board=feed_source(url,company)
            if board:
                # Do not retain the original role URL or description from the directory.
                if board['kind'] in ['ashby','greenhouse','lever','lever-eu']:
                    host={'ashby':'jobs.ashbyhq.com','greenhouse':'job-boards.greenhouse.io','lever':'jobs.lever.co','lever-eu':'jobs.eu.lever.co'}[board['kind']]
                    board['board_url']=f'https://{host}/{quote(board["slug"],safe="")}'
                found[board['id']]={**board,'discovered_from':source['board_url'],'discovery_method':'Employer name and ATS link; postings verified from employer feed'}
    if not found:raise ValueError('Employer directory contains no supported employer links; review required')
    return list(found.values())

def smartrecruiters(s):
    items=[];seen=set();offset=0;total=None
    while True:
        body,_=fetch(s['url']+f'?limit=100&offset={offset}',source=s);data=json.loads(body)
        batch=data.get('content');count=data.get('totalFound')
        if not isinstance(batch,list) or not isinstance(count,int):raise ValueError('SmartRecruiters feed has invalid pagination')
        total=count
        if not batch:
            if offset<total:raise ValueError('SmartRecruiters stopped before all postings were read')
            break
        for item in batch:
            if not item.get('id') or item['id'] in seen:raise ValueError('SmartRecruiters repeated or invalid posting ID')
            seen.add(item['id']);items.append(item)
        offset+=len(batch)
        if offset>=total:break
        if offset>=10000:raise ValueError('SmartRecruiters coverage limit reached; keeping existing listings')
    def read(item):
        body,_=fetch(s['url']+'/'+quote(str(item['id']),safe=''),source=s);j=json.loads(body)
        loc=j.get('location') or {};sections=(j.get('jobAd') or {}).get('sections') or {}
        if not j.get('name') or not j.get('postingUrl'):raise ValueError('SmartRecruiters detail is missing required fields')
        description='\n'.join(str(v.get('title',''))+'\n'+plain(v.get('text','')) for v in sections.values() if isinstance(v,dict))
        return {'title':j['name'],'location':', '.join(str(loc[k]) for k in ['city','region','country'] if loc.get(k)),'countryCodes':[loc['country']] if loc.get('country') else [],'descriptionPlain':description,'publishedAt':j.get('releasedDate',''),'dateBasis':'Posting release date (employer feed)','jobUrl':j['postingUrl'],'applyUrl':j['postingUrl'],'department':(j.get('department') or {}).get('label',''),'employmentType':(j.get('typeOfEmployment') or {}).get('label',''),'isRemote':loc.get('remote',False),'employerName':(j.get('company') or {}).get('name') or s['name']}
    with cf.ThreadPoolExecutor(max_workers=4) as pool:return list(pool.map(read,items))

def website_key(url):
    p=urlsplit(url or '');host=(p.hostname or '').lower().removeprefix('www.')
    if p.scheme not in ['http','https'] or not host or p.username or p.password or host=='localhost' or host.endswith(('.local','.internal')) or ':' in host or re.fullmatch(r'[\d.]+',host):return ''
    return 'website:'+host

def company_source(name,url,origin):
    key=website_key(url)
    if not key:return None
    # Social links identify a profile, not a verified employer careers source.
    host=key[8:]
    if any(host==d or host.endswith('.'+d) for d in ['linkedin.com','twitter.com','x.com','facebook.com','instagram.com','youtube.com','github.com']):return None
    board=feed_source(url,name)
    return {**(board or {'id':key,'kind':'html','name':name,'url':url,'website':url}),'discovered_from':origin}

def source_keys(s):
    return {s['id']}|({s['canonical_feed_id']} if s.get('canonical_feed_id') else set())|({website_key(s['website'])} if s.get('website') and s['kind'] not in ['speedrun-company','fortune-company'] else set())-{''}

def company_name_key(value):
    return re.sub(r'[^a-z0-9]','',re.sub(r'\b(?:the|inc|incorporated|llc|ltd|limited|corporation|corp)\b','',value or '',flags=re.I).lower())

def ashby_candidates(s):
    values=[s.get('slug',''),s.get('name','')]
    if s.get('website'):values.append((urlsplit(s['website']).hostname or '').removeprefix('www.').split('.')[0])
    out=[]
    for value in values:
        if not value or re.fullmatch(r'[a-f0-9]{8}-[a-f0-9-]{27,}',value,re.I):continue
        for slug in [re.sub(r'[^A-Za-z0-9._-]','',value),re.sub(r'[^a-z0-9._-]','',value.lower()),re.sub(r'[^a-z0-9]+','-',value.lower()).strip('-'),company_name_key(value)]:
            if 2<=len(slug)<=80 and slug not in out:out.append(slug)
    return out[:8]

def ashby_identity(body,s,board_url):
    match=re.search(r'"organization"\s*:\s*(\{)',body)
    if not match:return None
    try:org,_=json.JSONDecoder().raw_decode(body[match.start(1):])
    except (ValueError,TypeError):return None
    website=org.get('publicWebsite') or '';key=website_key(website)
    known={website_key(s.get(k,'')) for k in ['website','careers_url']}-{''}
    # For a generic employer website, its URL is itself a verified identity anchor.
    if s['kind']=='html' and not feed_source(s['url'],s['name']):known.add(website_key(s['url']))
    if key and key in known:return {'website':website,'matched_by':'Official website domain matches the registered employer'}
    name=company_name_key(s['name'])
    if not key or known or not name or name!=company_name_key(org.get('name','')):return None
    # Unknown domains require an official-site backlink, not just a similar slug.
    try:
        employer_page,final=fetch(website)
        if any((f:=feed_source(urljoin(final,u),s['name'])) and f['id']==feed_source(board_url,s['name'])['id'] for u in Page(employer_page).links):
            return {'website':website,'matched_by':'Employer name matches and official website links back to this Ashby board'}
    except Exception:pass
    return None

def recover_ashby(s,existing,known,original_error,current):
    attempts=[]
    for slug in ashby_candidates(s):
        url='https://jobs.ashbyhq.com/'+quote(slug,safe='')
        try:
            body,final=fetch(url,source=s);proof=ashby_identity(body,s,final)
            if not proof:attempts.append({'url':url,'result':'No matching employer identity'});continue
            candidate=feed_source(final,s['name'])
            if not candidate:continue
            feed,_=fetch(candidate['url'],source=s);data=json.loads(feed)
            if not isinstance(data.get('jobs'),list):raise ValueError('No valid Ashby job feed')
            repaired={**s,**candidate,'id':s['id'],'canonical_feed_id':candidate['id'],'website':proof['website']}
            # A successful current feed does not need to recheck every job a second time.
            result={**current,'source':repaired} if current['complete'] and s.get('kind')=='ashby' and candidate['id'] in [s['id'],s.get('canonical_feed_id')] else collect(repaired,existing,known,allow_fallback=False)
            if not result['complete']:attempts.append({'url':url,'result':'Ashby collection incomplete'});continue
            result['error']='; '.join(e for e in result['error'].split('; ') if not e.startswith('Company website:'))
            result['source']['recovery']={'checked_at':NOW(),'board_url':final,'previous_issue':original_error,'matched_by':proof['matched_by'],'note':'Jobs checked through Ashby; the original source issue is retained here for reference.'}
            result['source']['ashby_fallback']={'checked_at':NOW(),'outcome':'Verified board recovered','attempts':attempts+[{'url':url,'result':'Employer verified; job feed checked'}]}
            return result
        except Exception as e:attempts.append({'url':url,'result':str(e)[:160]})
    s['ashby_fallback']={'checked_at':NOW(),'outcome':'No verified replacement found','attempts':attempts}
    return None

def speedrun_profiles(fetcher=fetch):
    # Same public endpoint used by the directory, without the newest-cohort filter.
    out={};offset=0
    while True:
        url=f'https://speedrun.a16z.com/api/companies/companyparams?limit=96&offset={offset}'
        body,_=fetcher(url,source=SPEEDRUN);data=json.loads(body);batch=data.get('results')
        if not isinstance(batch,list) or not isinstance(data.get('count'),int):raise ValueError('Speedrun directory format changed')
        before=len(out)
        for c in batch:
            if not c.get('id') or not c.get('name') or not re.fullmatch(r'[a-zA-Z0-9_-]+',c.get('slug','')):raise ValueError('Speedrun company record is incomplete')
            out[c['id']]={'id':'speedrun:'+c['id'],'kind':'speedrun-company','name':c['name'],'url':'https://speedrun.a16z.com/companies/'+c['slug'],'portfolio_url':SPEEDRUN['url'],'headquarters_country':c.get('country',''),'cohort':c.get('cohort',''),'discovered_from':SPEEDRUN['url']}
        offset+=len(batch)
        if offset>=data['count'] and not data.get('next'):break
        if not batch or len(out)==before or offset>10000:raise ValueError('Speedrun pagination incomplete')
    if not out:raise ValueError('Speedrun returned an empty portfolio; existing companies preserved')
    return list(out.values())

def speedrun_company(body,s):
    m=re.search(r'<script\b[^>]*\bid=[\"\']__NEXT_DATA__[\"\'][^>]*>([\s\S]*?)</script>',body,re.I)
    if not m:raise ValueError('Speedrun company metadata unavailable')
    company=json.loads(m.group(1)).get('props',{}).get('pageProps',{}).get('company')
    if not isinstance(company,dict) or not company.get('name'):raise ValueError('Speedrun company metadata changed')
    url=company.get('website_url','');source=company_source(company['name'],url,s['url'])
    if not source:raise ValueError('Company has no public official website in Speedrun yet')
    s['website']=url;s['headquarters_country']=company.get('country','')
    return source

def fortune_company(body,s):
    # Only the publicly displayed Company Information website link is used.
    m=re.search(r'aria-label=[\"\']Visit the company website[\"\']',body,re.I)
    link=None
    if m:
        start=body.rfind('<a ',0,m.start());tag=body[start:body.find('>',m.end())]
        href=re.search(r'href=[\"\']([^\"\']+)',tag)
        if href:link=html.unescape(href.group(1))
    source=company_source(s['name'],link or s.get('website',''),s['url'])
    if not source:raise ValueError('Official employer website not available in public company information')
    s['website']=source.get('website',link);source['fortune_year']=s.get('fortune_year');source['fortune_rank']=s.get('fortune_rank')
    return source

def workable(s,body):
    if '/llms.txt' not in s['url']:return None
    urls=re.findall(r'https://apply\.workable\.com/[^\s`)>]+/jobs\.md',body)
    if not urls:raise ValueError('Workable careers index has no jobs feed')
    markdown,_=fetch(urls[0],source=s)
    links=list(dict.fromkeys(re.findall(r'https://apply\.workable\.com/(?:[^/\s)]+/)?j/[A-Za-z0-9]+/?',markdown)))
    rows=[]
    def read(url):
        b,_=fetch(url,source=s);page=Page(b)
        found=[schema_normalize(j,url) for d in page.schemas for j in schemas(d)]
        if not found:raise ValueError('Workable posting has no accessible job metadata')
        return found
    with cf.ThreadPoolExecutor(max_workers=4) as pool:
        for results in pool.map(read,links):rows.extend(results)
    if not rows and not re.search(r'0 current openings|no (?:current |open |available )?(?:jobs|positions|openings)|no roles',body+' '+markdown,re.I):raise ValueError('Workable feed could not confirm current listings')
    return rows

def workday(s):
    u=urlsplit(s['url']);tenant=(u.hostname or '').split('.')[0];parts=[x for x in u.path.split('/') if x and not re.fullmatch(r'[a-z]{2}-[A-Z]{2}',x)];site=parts[0];base=f'https://{u.hostname}/wday/cxs/{tenant}/{site}';items=[];offset=0
    while True:
        body,_=fetch(base+'/jobs',{'appliedFacets':{},'limit':20,'offset':offset,'searchText':''},source=s);d=json.loads(body)
        if not isinstance(d.get('jobPostings'),list):raise ValueError('Workday feed has no job postings list')
        batch=d['jobPostings'];items.extend(batch);offset+=len(batch)
        if offset>=d.get('total',0):break
        if not batch or offset>4000:raise ValueError('Workday pagination incomplete')
    def detail(item):
        loc=item.get('locationsText','')
        b,_=fetch(base+item['externalPath'],source=s);info=json.loads(b).get('jobPostingInfo')
        if not isinstance(info,dict):raise ValueError('Workday posting metadata unavailable')
        country=info.get('country') or {};country=country.get('descriptor','') if isinstance(country,dict) else country
        secondary=[{'location':v if isinstance(v,str) else v.get('descriptor','')} for v in info.get('additionalLocations',[]) or []]
        url=info.get('externalUrl') or f'https://{u.hostname}/en-US/{site}'+item['externalPath']
        return {'title':info.get('title') or item['title'],'location':str(info.get('location') or loc)+', '+str(country),'secondaryLocations':secondary,'descriptionPlain':plain(info.get('jobDescription','')),'workplaceType':'Remote' if 'remote' in str(info.get('remoteType','')).lower() else '', 'publishedAt':info.get('startDate'),'dateBasis':'Posting date (Workday metadata)' if info.get('startDate') else '', 'jobUrl':url,'applyUrl':url,'employmentType':info.get('timeType') or ''}
    with cf.ThreadPoolExecutor(max_workers=4) as pool:return [j for j in pool.map(detail,items) if j]

def amazon_jobs(s):
    rows=[];complete=True
    for country in ['USA','CAN']:
        offset=0;ids=set()
        while True:
            body,_=fetch(f'https://www.amazon.jobs/en/search.json?country={country}&offset={offset}&result_limit=100&sort=recent',source=s)
            data=json.loads(body);batch=data.get('jobs')
            if not isinstance(batch,list) or data.get('error'):raise ValueError('Amazon search did not return a valid job list')
            if not batch:break
            new=[j for j in batch if str(j.get('id_icims') or j.get('id')) not in ids]
            if not new:complete=False;break
            for j in new:
                ids.add(str(j.get('id_icims') or j.get('id')))
                url=urljoin('https://www.amazon.jobs',j['job_path'])
                rows.append({'title':j['title'],'location':j.get('location',''),'countryCodes':[{'USA':'US','CAN':'CA'}.get(j.get('country_code'),j.get('country_code',''))],'descriptionPlain':'\n'.join(plain(j.get(k,'')) for k in ['description','basic_qualifications','preferred_qualifications']),'department':j.get('job_category',''),'employmentType':'Internship' if j.get('is_intern') else j.get('job_schedule_type',''),'jobUrl':url,'applyUrl':url,'publishedAt':j.get('posted_date',''),'dateBasis':'Posting date (Amazon careers)'})
            offset+=len(batch)
            if offset>=int(data.get('hits',0)):
                if int(data.get('hits',0))>=10000:complete=False
                break
    return rows,complete

def tesla_jobs(s):
    body,_=fetch('https://www.tesla.com/cua-api/apps/careers/state',source=s);data=json.loads(body)
    if not isinstance(data.get('listings'),list):raise ValueError('Tesla careers returned no valid listings')
    locations={}
    for region in data.get('geo',[]):
        for site in region.get('sites',[]):
            for state in site.get('states',[]):
                for codes in state.get('cities',{}).values():
                    for code in codes:locations[str(code)]=site['id']
    selected=[j for j in data['listings'] if locations.get(str(j.get('l'))) in ['US','CA']]
    if data['listings'] and not selected:raise ValueError('Tesla location lookup could not resolve US/Canada roles')
    def detail(item):
        body,_=fetch('https://www.tesla.com/cua-api/careers/job/'+str(item['id']),source=s);j=json.loads(body)
        if not j.get('title') or not j.get('url'):raise ValueError('Tesla job detail unavailable')
        url=urljoin('https://www.tesla.com',j['url'])
        return {'title':j['title'],'location':j.get('location',''),'countryCodes':[j.get('country','')],'descriptionPlain':'\n'.join(plain(j.get(k,'')) for k in ['jobDescription','jobResponsibilities','jobRequirements','jobCompensationAndBenefits']),'department':j.get('department',''),'employmentType':j.get('timeType',''),'validThrough':j.get('postUntilDate'),'jobUrl':url,'applyUrl':url}
    rows=[];failures=0
    with cf.ThreadPoolExecutor(max_workers=6) as pool:
        futures=[pool.submit(detail,item) for item in selected]
        for f in cf.as_completed(futures):
            try:rows.append(f.result())
            except Exception:failures+=1
    return rows,failures==0

def meta_jobs(s):
    import xml.etree.ElementTree as ET
    body,_=fetch(s['url'],source=s);root=ET.fromstring(body)
    urls=list(dict.fromkeys(e.text for e in root.iter() if e.tag.endswith('loc') and e.text and re.search(r'https://www.metacareers.com/(?:profile/job_details|jobs)/\d+',e.text)))
    if not urls:raise ValueError('Meta public sitemap contains no job links; coverage incomplete')
    def detail(url):
        body,_=fetch(url,source=s);page=Page(body)
        rows=[schema_normalize(j,url) for d in page.schemas for j in schemas(d)]
        if not rows:raise ValueError('Meta posting metadata unavailable')
        return rows
    rows=[];failures=0
    with cf.ThreadPoolExecutor(max_workers=6) as pool:
        for future in cf.as_completed([pool.submit(detail,url) for url in urls]):
            try:rows.extend(future.result())
            except Exception:failures+=1
    return rows,failures==0

def collect(s,existing,known,allow_fallback=True):
    jobs=[];seen=[];closed=[];errors=[];complete=False;discovered=[];raw=[]
    try:
        body,_=('',s['url']) if s['kind'] in ['workday','speedrun','amazon','tesla','meta','smartrecruiters'] or (s['kind']=='fortune-company' and s.get('website')) else fetch(s['url']+('&' if '?' in s['url'] else '?')+'includeCompensation=true' if s['kind']=='ashby' and 'includeCompensation' not in s['url'] else s['url'],source=s)
        if s['kind']=='speedrun':discovered=speedrun_profiles();complete=True
        elif s['kind']=='employer-index':discovered=discover_employer_boards(body,s);complete=True
        elif s['kind']=='smartrecruiters':raw=smartrecruiters(s);complete=True
        elif s['kind']=='speedrun-company':discovered=[speedrun_company(body,s)];complete=True
        elif s['kind']=='fortune-company':discovered=[fortune_company(body,s)];complete=True
        elif s['kind']=='workday':raw=workday(s);complete=True
        elif s['kind'] in ['amazon','tesla','meta']:
            raw,complete={'amazon':amazon_jobs,'tesla':tesla_jobs,'meta':meta_jobs}[s['kind']](s)
            if not complete:errors.append('Job feed: partial employer coverage; some listings could not be retrieved or the search limit was reached')
        elif s['kind']=='workable' and '/llms.txt' in s['url']:raw=workable(s,body);complete=True
        elif s['kind'] in ['ashby','greenhouse','lever','lever-eu']:
            data=json.loads(body);items=data if isinstance(data,list) else data.get('jobs')
            if not isinstance(items,list):raise ValueError('Job feed has no valid jobs list')
            complete=True
            for item in items:
                if item.get('isListed') is False:continue
                if s['kind']=='ashby':j=item
                elif s['kind']=='greenhouse':
                    j={'title':item.get('title'),'location':(item.get('location') or {}).get('name',''),'descriptionPlain':plain(item.get('content','')),'isRemote':'remote' in (item.get('location') or {}).get('name','').lower(),'department':', '.join(d.get('name','') for d in item.get('departments',[])),'jobUrl':item.get('absolute_url'),'applyUrl':item.get('absolute_url')}
                    if item.get('id'):
                        details,_=fetch(f"https://boards-api.greenhouse.io/v1/boards/{quote(s['slug'],safe='')}/jobs/{item['id']}",source=s)
                        d=json.loads(details);j.update(publishedAt=d.get('first_published'),dateBasis='First published (Greenhouse)' if d.get('first_published') else '',validThrough=d.get('application_deadline'))
                else:
                    cat=item.get('categories') or {};j={'title':item.get('text'),'location':cat.get('location',''),'secondaryLocations':[{'location':v} for v in cat.get('allLocations',[])],'descriptionPlain':plain(item.get('description',''))+' '+plain(' '.join(v.get('content','') for v in item.get('lists',[])))+' '+plain(item.get('additional','')),'department':cat.get('department',''),'workplaceType':str(item.get('workplaceType','')).title(),'employmentType':cat.get('commitment',''),'jobUrl':item.get('hostedUrl'),'applyUrl':item.get('applyUrl'),'salaryRange':item.get('salaryRange'),'salaryDescription':item.get('salaryDescription')}
                raw.append(j)
        else:
            page=Page(body)
            for d in page.schemas:
                for j in schemas(d):raw.append(schema_normalize(j,s['url']))
            complete=bool(raw) or bool(re.search(r'no (?:current |open |available )?(?:jobs|positions|openings)',plain(body),re.I))
            for u in page.links:
                f=feed_source(urljoin(s['url'],u),s['name'])
                if f and f['id'] not in known:discovered.append(f)
            # JSON-LD listings may belong to employers outside the existing registry.
            for j in raw:
                name=j.get('employerName') or s['name']
                for u in [j.get('employerWebsite'),j.get('jobUrl')]:
                    if not isinstance(u,str):continue
                    f=company_source(name,u,s['url']) if u==j.get('employerWebsite') else feed_source(u,name)
                    if f and f['id'] not in known:discovered.append(f)
            if not complete and not discovered:errors.append('Careers page has no accessible job feed; verification incomplete')
        def check(j):
            u=j.get('applyUrl') or j.get('jobUrl') or ''
            if u:seen.append(ident(u))
            try:
                row=normalize(j,s,existing)
                if row and row.get('closed'):closed.append(row['id'])
                elif row:jobs.append(row)
            except Exception as e:errors.append('Application check: '+str(e)[:150])
        with cf.ThreadPoolExecutor(max_workers=4) as checks:list(checks.map(check,raw))
    except Exception as e:errors.append('Job feed: '+str(e)[:200])
    # Recheck official website and up to two careers pages to discover changed boards.
    if s.get('website') and s['kind'] not in ['speedrun','speedrun-company','fortune-company']:
        try:
            body,landing=fetch(s['website'],source=s);page=Page(body);urls=[]
            for u in page.links:
                url=urljoin(landing,u);f=feed_source(url,s['name'])
                if f and f['id'] not in known:discovered.append(f)
                if (re.search(r'career|jobs|join-us|join-our-team',url,re.I) or re.search(r'\bcareers?\b|\bjobs\b|join our team',page.link_text.get(u,''),re.I)) and company_source(s['name'],url,landing) and url not in urls:urls.append(url)
            if s.get('careers_url') and s['careers_url'] not in urls:urls.insert(0,s['careers_url'])
            for url in urls[:2]:
                if feed_source(url,s['name']):continue
                b,final=fetch(url,source=s);p=Page(b)
                for u in p.links:
                    f=feed_source(urljoin(final,u),s['name'])
                    if f and f['id'] not in known:discovered.append(f)
                if final!=s['url']:
                    discovered.append({'id':'html:'+hashlib.sha256(final.encode()).hexdigest()[:16],'name':s['name'],'kind':'html','url':final,'discovered_from':s['url']})
        except Exception as e:errors.append('Company website: '+str(e)[:180])
    # A website failure does not invalidate a complete feed, but all gaps stay visible.
    incomplete=sum(j.get('link_status')=='Check incomplete' for j in jobs)
    if incomplete:errors.append(f'Application links: {incomplete} verification incomplete')
    source_error='; '.join(dict.fromkeys(errors))
    for f in discovered:
        f.setdefault('discovered_from',s['url'])
        if s.get('portfolio_url'):f.setdefault('portfolio_url',s['portfolio_url'])
        if s.get('fortune_year'):f.setdefault('fortune_year',s['fortune_year']);f.setdefault('fortune_rank',s.get('fortune_rank'))
    result={'source':s,'jobs':jobs,'seen_ids':seen,'closed_ids':closed,'complete':complete and not any(e.startswith(('Job feed:','Application check:')) for e in errors),'error':source_error,'discovered':discovered}
    if not source_error and result['complete'] and s.get('recovery'):
        s['recovery']={**s['recovery'],'checked_at':NOW(),'note':'Jobs checked through the verified Ashby board; the original source issue is retained for reference.'}
    if source_error and allow_fallback and s['kind'] not in ['speedrun','employer-index']:
        recovered=recover_ashby(s,existing,known,source_error,result)
        if recovered:return recovered
        result['error']+='; Ashby fallback: no verified replacement found'
    return result

def save_result(result):
    # Keep each write comfortably below Vercel's request body limit. Only the
    # final packet advances source coverage and missing-job checks.
    jobs=result['jobs'];batch=[];size=0
    for job in jobs:
        encoded=len(json.dumps(job).encode())
        if batch and (size+encoded>1_500_000 or len(batch)>=60):
            api('ingest',{**result,'jobs':batch,'seen_ids':[],'closed_ids':[],'complete':False,'partial':True});batch=[];size=0
        batch.append(job);size+=encoded
    if batch:api('ingest',{**result,'jobs':batch,'seen_ids':[],'closed_ids':[],'complete':False,'partial':True})
    return api('ingest',{**result,'jobs':[],'partial':False})

@contextmanager
def refresh_run():
    # Persist our own ID before starting, so a lost response or runner failure
    # can be cleaned up without touching another collector's run.
    run=str(uuid.uuid4())
    if os.environ.get('REFRESH_RUN_STATE'):Path(os.environ['REFRESH_RUN_STATE']).write_text(run)
    try:
        started=api('start-run',{'run_id':run})
        if started['id']!=run:raise RuntimeError('Refresh identifier mismatch')
        yield run
    except BaseException:
        try:api('finish-run',{'run_id':run,'interrupted':True})
        except Exception as e:print('Refresh cleanup failed; workflow cleanup will retry:',type(e).__name__,flush=True)
        raise

def cleanup_run():
    state=os.environ.get('REFRESH_RUN_STATE')
    if state and Path(state).exists():
        run=str(uuid.UUID(Path(state).read_text().strip()))
        print(json.dumps({'cleanup':api('finish-run',{'run_id':run,'interrupted':True})}),flush=True)

def expire_jobs(run):
    expired=0;cursor=''
    while True:
        result=api('expire',{'run_id':run,'after':cursor});expired+=result['expired']
        following=result.get('next_cursor')
        if not following:return expired
        if following<=cursor:raise RuntimeError('Expiration cursor did not advance')
        cursor=following

def verify_lifecycle():
    with refresh_run() as first:
        assert api('start-run',{'run_id':first})['id']==first, 'Start retry must reuse its own run'
        try:api('start-run',{'run_id':str(uuid.uuid4())})
        except HTTPError as e:
            if e.code!=409:raise
        else:raise AssertionError('Concurrent refresh must be rejected')
        print(json.dumps({'expired':expire_jobs(first)}),flush=True)
        api('finish-run',{'run_id':first,'verification':True})
    # Verify that a failed cleanup phase releases the lock for the next run.
    class VerificationFailure(Exception):pass
    try:
        with refresh_run():raise VerificationFailure()
    except VerificationFailure:pass
    with refresh_run() as last:api('finish-run',{'run_id':last,'verification':True})
    print('Refresh lifecycle verified: start retry, overlap protection, paginated expiration, failure cleanup and restart.',flush=True)

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--limit',type=int,default=0);parser.add_argument('--source');parser.add_argument('--cleanup',action='store_true');parser.add_argument('--verify-lifecycle',action='store_true');args=parser.parse_args()
    if args.cleanup:return cleanup_run()
    if args.verify_lifecycle:return verify_lifecycle()
    state=api('sources');existing={};cursor=''
    while True:
        page=api('existing-jobs'+('?after='+quote(cursor,safe='') if cursor else ''))
        existing.update((j['id'],j) for j in page['existing']);cursor=page.get('next_cursor')
        if not cursor:break
    sources=state['sources'];known=set().union(*(source_keys(s) for s in sources))
    for index in [SPEEDRUN,*EMPLOYER_INDEXES]:
        if index['id'] not in known:
            api('register-source',{'source':index});sources.append(index);known.add(index['id'])
    # Existing opportunities can reveal ATS boards absent from the registry.
    for job in existing.values():
        f=feed_source(job.get('apply_url',''),job.get('company') or 'Discovered employer')
        if f and f['id'] not in known:api('register-source',{'source':f});sources.append(f);known.update(source_keys(f))
    if args.source:sources=[s for s in sources if s['id']==args.source]
    if args.limit:sources=sources[:args.limit]
    global FX
    FX=api('rates')
    count=0;failed=0;writes_failed=0
    with refresh_run() as run:
        print(json.dumps({'expired':expire_jobs(run)}),flush=True)
        with cf.ThreadPoolExecutor(max_workers=20) as pool, cf.ThreadPoolExecutor(max_workers=8) as writers:
            futures={pool.submit(collect,s,existing,known):s for s in sources}
            saves={}
            def collect_save(future):
                nonlocal writes_failed,count
                source=saves.pop(future)
                try:future.result()
                except Exception as e:writes_failed+=1;print('Save failed:',source['name'],str(e),flush=True)
                count+=1
                if count%50==0:print(json.dumps({'checked':count,'incomplete':failed,'save_errors':writes_failed}),flush=True)
            while futures:
                done,_=cf.wait(futures,return_when=cf.FIRST_COMPLETED)
                for future in done:
                    futures.pop(future);result=future.result();known.update(source_keys(result['source']));new=result.pop('discovered');result['run_id']=run
                    if result['error']:failed+=1
                    saves[writers.submit(save_result,result)]=result['source']
                    for source in new:
                        if source['id'] not in known:
                            known.update(source_keys(source));api('register-source',{'source':source});futures[pool.submit(collect,source,existing,known)]=source
                for f in list(saves):
                    if f.done():collect_save(f)
                if len(saves)>40:
                    done,_=cf.wait(saves,return_when=cf.FIRST_COMPLETED)
                    for f in done:collect_save(f)
            for f in cf.as_completed(list(saves)):collect_save(f)
        api('finish-run',{'run_id':run,'error':bool(failed or writes_failed)})
        print(json.dumps({'run_id':run,'checked':count,'incomplete':failed,'save_errors':writes_failed}),flush=True)
        if writes_failed:sys.exit(1)
if __name__=='__main__':main()

