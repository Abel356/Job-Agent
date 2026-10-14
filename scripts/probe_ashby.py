"""Read-only Ashby identity/feed probes for an exported source registry."""
import argparse,concurrent.futures as cf,json
from pathlib import Path
import refresh_jobs as m

def probe(source):
    attempts=[]
    for slug in m.ashby_candidates(source):
        url='https://jobs.ashbyhq.com/'+m.quote(slug,safe='')
        try:
            body,final=m.fetch(url,source=source);proof=m.ashby_identity(body,source,final)
            if not proof:attempts.append({'url':url,'result':'Employer identity not verified'});continue
            feed=m.feed_source(final,source['name'])
            if not feed:continue
            body,_=m.fetch(feed['url'],source=source);data=json.loads(body)
            if not isinstance(data.get('jobs'),list):raise ValueError('No valid job list')
            repaired={**source,**feed,'id':source['id'],'canonical_feed_id':feed['id'],'website':proof['website']}
            return {'id':source['id'],'name':source['name'],'verified':True,'board_url':final,'job_count':len(data['jobs']),'proof':proof,'original_url':source['url'],'original_error':source.get('error',''),'source':repaired,'checked_at':m.NOW()}
        except Exception as e:attempts.append({'url':url,'result':str(e)[:160]})
    return {'id':source['id'],'name':source['name'],'verified':False,'attempts':attempts,'checked_at':m.NOW()}

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('snapshot');p.add_argument('report');args=p.parse_args()
    sources=json.loads(Path(args.snapshot).read_text())['sources'];sources=[s for s in sources if s.get('error')]
    rows=[]
    with cf.ThreadPoolExecutor(max_workers=16) as pool:
        for future in cf.as_completed([pool.submit(probe,s) for s in sources]):
            rows.append(future.result())
            if len(rows)%25==0:print(json.dumps({'checked':len(rows),'total':len(sources),'verified':sum(r['verified'] for r in rows)}),flush=True)
    Path(args.report).write_text(json.dumps(rows,indent=2))
    print(json.dumps({'checked':len(rows),'verified':sum(r['verified'] for r in rows),'report':args.report}),flush=True)
