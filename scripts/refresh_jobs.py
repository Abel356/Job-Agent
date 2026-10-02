#!/usr/bin/env python3
"""Scheduled company job collection. Standard library only; no AI services."""
import argparse, concurrent.futures as cf, datetime as dt, hashlib, html, json, os, re, sys, time, threading
from html.parser import HTMLParser
from urllib.parse import urlsplit, urljoin, quote, unquote
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
    attempts=3 if data is None or path in ['import','settings','category','finish-run'] else 1
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
        if result['status']!=200:raise SourceFailure(result['status'],plain(result.get('body','')))
        return result['body'],result['url']
    payload=json.dumps(data).encode() if data is not None else None
    headers={'User-Agent':'EarthworkJobs/1.0','Accept':'application/json,text/html,text/plain'}
    if payload is not None:headers['Content-Type']='application/json'
    with PUBLIC_LIMIT:
        with urlopen(Request(url,data=payload,headers=headers),timeout=18) as r:
            body=r.read(5_000_001)
            if len(body)>5_000_000:raise ValueError('Source exceeds the 5 MB limit')
            return body.decode('utf-8',errors='replace'),r.geturl()

def ident(url):
    p=urlsplit(url);path=p.path.rstrip('/').removesuffix('/application').removesuffix('/apply')
    if p.hostname=='jobs.ashbyhq.com':path=path.lower()
    return hashlib.sha256((p.netloc.lower()+path).encode()).hexdigest()[:32]

def plain(s):return re.sub(r'[ \t]+',' ',html.unescape(re.sub(r'<[^>]*>',' ',s or ''))).strip()
class Page(HTMLParser):
    def __init__(self,body):
        super().__init__();self.links=[];self.schemas=[];self.ld=False;self.buf='';self.feed(body)
    def handle_starttag(self,tag,attrs):
        a=dict(attrs)
        if tag=='a' and a.get('href'):self.links.append(a['href'])
        if tag=='script' and a.get('type')=='application/ld+json':self.ld=True;self.buf=''
    def handle_data(self,data):
        if self.ld:self.buf+=data
    def handle_endtag(self,tag):
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
    if not reason:return None
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
    if not parts:return None
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
    return {'title':j.get('title'),'location':' | '.join(names),'descriptionPlain':plain(j.get('description','')),'isRemote':j.get('jobLocationType')=='TELECOMMUTE','workplaceType':'Remote' if j.get('jobLocationType')=='TELECOMMUTE' else '', 'publishedAt':j.get('datePosted'),'dateBasis':'Posting date (website metadata)','validThrough':j.get('validThrough'),'employmentType':j.get('employmentType'),'jobUrl':j.get('url') or url,'applyUrl':j.get('url') or url,'baseSalary':j.get('baseSalary')}

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
        if loc and not CANADA.search(US_CITY.sub('',loc)) and not re.search(r'locations|remote',loc,re.I):return None
        b,_=fetch(base+item['externalPath'],source=s);info=json.loads(b).get('jobPostingInfo')
        if not isinstance(info,dict):raise ValueError('Workday posting metadata unavailable')
        country=info.get('country') or {};country=country.get('descriptor','') if isinstance(country,dict) else country
        secondary=[{'location':v if isinstance(v,str) else v.get('descriptor','')} for v in info.get('additionalLocations',[]) or []]
        url=info.get('externalUrl') or f'https://{u.hostname}/en-US/{site}'+item['externalPath']
        return {'title':info.get('title') or item['title'],'location':str(info.get('location') or loc)+', '+str(country),'secondaryLocations':secondary,'descriptionPlain':plain(info.get('jobDescription','')),'workplaceType':'Remote' if 'remote' in str(info.get('remoteType','')).lower() else '', 'publishedAt':info.get('startDate'),'dateBasis':'Posting date (Workday metadata)' if info.get('startDate') else '', 'jobUrl':url,'applyUrl':url,'employmentType':info.get('timeType') or ''}
    with cf.ThreadPoolExecutor(max_workers=4) as pool:return [j for j in pool.map(detail,items) if j]

def collect(s,existing,known):
    jobs=[];seen=[];closed=[];errors=[];complete=False;discovered=[];raw=[]
    try:
        body,_=('',s['url']) if s['kind']=='workday' else fetch(s['url']+('&' if '?' in s['url'] else '?')+'includeCompensation=true' if s['kind']=='ashby' and 'includeCompensation' not in s['url'] else s['url'],source=s)
        if s['kind']=='workday':raw=workday(s);complete=True
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
                    if eligible(j):
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
            if not complete and not discovered:errors.append('Careers page has no accessible job feed; verification incomplete')
        def check(j):
            u=j.get('applyUrl') or j.get('jobUrl') or ''
            if u and eligible(j):seen.append(ident(u))
            try:
                row=normalize(j,s,existing)
                if row and row.get('closed'):closed.append(row['id'])
                elif row:jobs.append(row)
            except Exception as e:errors.append('Application check: '+str(e)[:150])
        with cf.ThreadPoolExecutor(max_workers=4) as checks:list(checks.map(check,raw))
    except Exception as e:errors.append('Job feed: '+str(e)[:200])
    # Recheck official website and up to two careers pages to discover changed boards.
    if s.get('website'):
        try:
            body,landing=fetch(s['website'],source=s);page=Page(body);urls=[]
            for u in page.links:
                url=urljoin(landing,u);f=feed_source(url,s['name'])
                if f and f['id'] not in known:discovered.append(f)
                if re.search(r'career|jobs|join-us|join-our-team',url,re.I) and urlsplit(url).hostname==urlsplit(landing).hostname and url not in urls:urls.append(url)
            if s.get('careers_url') and s['careers_url'] not in urls:urls.insert(0,s['careers_url'])
            for url in urls[:2]:
                if feed_source(url,s['name']):continue
                b,final=fetch(url,source=s);p=Page(b)
                for u in p.links:
                    f=feed_source(urljoin(final,u),s['name'])
                    if f and f['id'] not in known:discovered.append(f)
                discovered.extend({'id':'html:'+hashlib.sha256(final.encode()).hexdigest()[:16],'name':s['name'],'kind':'html','url':final} for d in p.schemas if any(True for _ in schemas(d)))
        except Exception as e:errors.append('Company website: '+str(e)[:180])
    # A website failure does not invalidate a complete feed, but all gaps stay visible.
    incomplete=sum(j.get('link_status')=='Check incomplete' for j in jobs)
    if incomplete:errors.append(f'Application links: {incomplete} verification incomplete')
    source_error='; '.join(dict.fromkeys(errors))
    return {'source':s,'jobs':jobs,'seen_ids':seen,'closed_ids':closed,'complete':complete and not any(e.startswith(('Job feed:','Application check:')) for e in errors),'error':source_error,'discovered':discovered}

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--limit',type=int,default=0);parser.add_argument('--source');args=parser.parse_args()
    state=api('sources');existing={j['id']:j for j in state['existing']};sources=state['sources'];known={s['id'] for s in sources}
    if args.source:sources=[s for s in sources if s['id']==args.source]
    if args.limit:sources=sources[:args.limit]
    global FX
    FX=api('rates')
    run=api('start-run',{})['id'];print(json.dumps({'expired':api('expire',{'run_id':run})['expired']}),flush=True);count=0;failed=0;writes_failed=0
    try:
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
                    futures.pop(future);result=future.result();new=result.pop('discovered');result['run_id']=run
                    if result['error']:failed+=1
                    saves[writers.submit(api,'ingest',result)]=result['source']
                    for source in new:
                        if source['id'] not in known:
                            known.add(source['id']);api('register-source',{'source':source});futures[pool.submit(collect,source,existing,known)]=source
                for f in list(saves):
                    if f.done():collect_save(f)
                if len(saves)>40:
                    done,_=cf.wait(saves,return_when=cf.FIRST_COMPLETED)
                    for f in done:collect_save(f)
            for f in cf.as_completed(list(saves)):collect_save(f)
        api('finish-run',{'run_id':run,'error':bool(failed or writes_failed)})
        print(json.dumps({'run_id':run,'checked':count,'incomplete':failed,'save_errors':writes_failed}),flush=True)
        if writes_failed:sys.exit(1)
    except BaseException:
        try:api('finish-run',{'run_id':run,'error':True})
        except:pass
        raise
if __name__=='__main__':main()
