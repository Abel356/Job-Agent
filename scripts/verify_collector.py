"""Checks deadline safety and credential isolation without network requests."""
import importlib.util,json,unittest,tempfile,os
from unittest.mock import patch
from pathlib import Path
s=importlib.util.spec_from_file_location('collector',Path(__file__).with_name('refresh_jobs.py'))
m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
class Response:
    def __enter__(self):return self
    def __exit__(self,*args):pass
    def read(self,n):return b'{"ok":true}'
    def geturl(self):return 'https://example.com/careers'
class CollectorTests(unittest.TestCase):
    def test_expiration_failure_releases_owned_run(self):
        calls=[]
        def api(path,data=None):
            calls.append((path,data))
            if path=='start-run':return {'id':data['run_id']}
            if path=='expire':raise RuntimeError('Database unavailable')
            return {'finished':True}
        with patch.object(m,'api',side_effect=api),patch.dict(os.environ,{'REFRESH_RUN_STATE':''}):
            with self.assertRaisesRegex(RuntimeError,'Database unavailable'):
                with m.refresh_run() as run:m.expire_jobs(run)
        self.assertEqual(calls[-1],('finish-run',{'run_id':run,'interrupted':True}))
    def test_lost_start_response_cleans_only_owned_id(self):
        calls=[]
        def api(path,data=None):
            calls.append((path,data))
            if path=='start-run':raise OSError('Lost response after commit')
            return {'finished':True}
        with tempfile.TemporaryDirectory() as temp,patch.dict(os.environ,{'REFRESH_RUN_STATE':temp+'/run'}),patch.object(m,'api',side_effect=api):
            with self.assertRaises(OSError):
                with m.refresh_run():self.fail('Unconfirmed start must not collect')
            stored=Path(temp+'/run').read_text()
            self.assertEqual(calls[0][1]['run_id'],stored)
            self.assertEqual(calls[-1][1]['run_id'],stored)
    def test_paginated_expiration(self):
        with patch.object(m,'api',side_effect=[{'expired':2,'next_cursor':'abc'},{'expired':3,'next_cursor':None}]) as api:
            self.assertEqual(m.expire_jobs('run'),5)
        self.assertEqual(api.call_args_list[1].args,('expire',{'run_id':'run','after':'abc'}))
    def test_expiration_cursor_must_advance(self):
        with patch.object(m,'api',return_value={'expired':0,'next_cursor':'abc'}):
            with self.assertRaisesRegex(RuntimeError,'cursor did not advance'):m.expire_jobs('run')
    def test_workflow_cleanup_does_not_touch_completed_runs(self):
        run=str(m.uuid.uuid4())
        with tempfile.TemporaryDirectory() as temp,patch.dict(os.environ,{'REFRESH_RUN_STATE':temp+'/run'}),patch.object(m,'api',return_value={'finished':False}) as api:
            Path(temp+'/run').write_text(run);m.cleanup_run()
            api.assert_called_once_with('finish-run',{'run_id':run,'interrupted':True})
    def test_amazon_countries_and_pagination(self):
        calls=[]
        def read(url,**kw):
            calls.append(url);can='country=CAN' in url;second='offset=1' in url
            job={'id_icims':('ca' if can else 'us')+str(second),'title':'Engineer','job_path':'/en/jobs/123/engineer','country_code':'CAN' if can else 'USA','location':'Toronto' if can else 'Seattle'}
            return json.dumps({'hits':2,'jobs':[job]}),url
        with patch.object(m,'fetch',side_effect=read):rows,complete=m.amazon_jobs({'id':'major:amazon'})
        self.assertTrue(complete);self.assertEqual(len(rows),4);self.assertEqual(rows[0]['countryCodes'],['US']);self.assertEqual(rows[-1]['countryCodes'],['CA'])
        self.assertTrue(any('offset=1' in u for u in calls))
    def test_meta_sitemap_and_posting_metadata(self):
        url='https://www.metacareers.com/profile/job_details/123/'
        sitemap='<urlset><url><loc>'+url+'</loc></url></urlset>'
        posting='<script type="application/ld+json">'+json.dumps({'@type':'JobPosting','title':'University Grad Engineer','hiringOrganization':{'name':'Meta'},'jobLocation':{'address':{'addressCountry':'CA'}}})+'</script>'
        with patch.object(m,'fetch',side_effect=lambda u,**kw:(sitemap if u.endswith('sitemap.xml') else posting,u)):
            rows,complete=m.meta_jobs({'url':'https://www.metacareers.com/jobsearch/sitemap.xml'})
        self.assertTrue(complete);self.assertEqual(rows[0]['countryCodes'],['CA'])
    def test_direct_employer_boards(self):
        self.assertEqual(m.feed_source('https://www.amazon.jobs/en/jobs/123/example','Amazon')['kind'],'amazon')
        self.assertEqual(m.feed_source('https://www.tesla.com/careers/search','Tesla')['kind'],'tesla')
        self.assertEqual(m.feed_source('https://www.metacareers.com/jobs/','Meta')['kind'],'meta')
    def test_tesla_location_scope_and_failed_details(self):
        state={'listings':[{'id':'1','l':'toronto'},{'id':'2','l':'seattle'},{'id':'3','l':'london'}],'geo':[{'sites':[{'id':'CA','states':[{'cities':{'Toronto':['toronto']}}]},{'id':'US','states':[{'cities':{'Seattle':['seattle']}}]},{'id':'GB','states':[{'cities':{'London':['london']}}]}]}]}
        def read(url,**kw):
            if url.endswith('/state'):return json.dumps(state),url
            if url.endswith('/2'):raise ValueError('Temporary failure')
            self.assertTrue(url.endswith('/1'))
            return json.dumps({'title':'Electrical Engineer','url':'/careers/search/job/1','country':'CA','location':'Toronto'}),url
        with patch.object(m,'fetch',side_effect=read):rows,complete=m.tesla_jobs({'id':'major:tesla'})
        self.assertFalse(complete);self.assertEqual(len(rows),1);self.assertEqual(rows[0]['countryCodes'],['CA'])
    def test_ashby_variants_and_uuid(self):
        self.assertIn('AirApps',m.ashby_candidates({'name':'Air Apps'}))
        self.assertIn('air-apps',m.ashby_candidates({'name':'Air Apps'}))
        self.assertEqual(m.ashby_candidates({'name':'91b38662-e5a9-4bc3-ade7-44e29d01d343'}),[])
    def test_ashby_rejects_wrong_employer(self):
        body='"organization":'+json.dumps({'name':'Acme','publicWebsite':'https://different.example'})
        self.assertIsNone(m.ashby_identity(body,{'name':'Acme','kind':'ashby','url':'https://api.ashbyhq.com/','website':'https://acme.example'},'https://jobs.ashbyhq.com/acme'))
    def test_verified_fallback_preserves_source_and_notes(self):
        s={'id':'old-source','name':'Acme','kind':'html','url':'https://acme.example/careers','website':'https://acme.example'}
        body='"organization":'+json.dumps({'name':'Acme','publicWebsite':'https://acme.example'})
        current={'source':s,'complete':False,'error':'Job feed: HTTP 404','jobs':[],'seen_ids':[],'closed_ids':[],'discovered':[]}
        def fetch(url,**kw):return (json.dumps({'jobs':[]}) if 'api.ashbyhq' in url else body),url
        with patch.object(m,'fetch',side_effect=fetch),patch.object(m,'collect',return_value={**current,'complete':True,'error':'Company website: HTTP 403'}) as collect:
            result=m.recover_ashby(s,{},set(),current['error'],current)
        self.assertEqual(result['error'],'');self.assertEqual(result['source']['id'],'old-source')
        self.assertIn('previous_issue',result['source']['recovery']);self.assertFalse(collect.call_args.kwargs['allow_fallback'])
    def test_fortune_public_company_information(self):
        s={'name':'Example','url':'https://fortune.com/company/example/','fortune_year':2026}
        body='<span>Website:</span><a href="https://example.com" aria-label="Visit the company website">Example</a>'
        source=m.fortune_company(body,s)
        self.assertEqual(source['website'],'https://example.com');self.assertEqual(source['fortune_year'],2026)
    def test_speedrun_paginates_all_cohorts(self):
        pages=[{'count':2,'next':'next','results':[{'id':'1','name':'One','slug':'one','cohort':'SR001'}]}, {'count':2,'next':None,'results':[{'id':'2','name':'Two','slug':'two','cohort':'SR007'}]}]
        calls=[]
        def read(url,**kwargs):calls.append(url);return json.dumps(pages.pop(0)),url
        rows=m.speedrun_profiles(read)
        self.assertEqual(len(rows),2);self.assertIn('offset=1',calls[1]);self.assertNotIn('cohort=',calls[0])
    def test_speedrun_empty_fails_without_deleting(self):
        with self.assertRaises(ValueError):m.speedrun_profiles(lambda *a,**kw:(json.dumps({'count':0,'next':None,'results':[]}),''))
    def test_speedrun_profile_official_site(self):
        body='<script id="__NEXT_DATA__" type="application/json">'+json.dumps({'props':{'pageProps':{'company':{'name':'Example','website_url':'https://example.com','country':'India'}}}})+'</script>'
        s={'url':'https://speedrun.a16z.com/companies/example'}
        discovered=m.speedrun_company(body,s)
        self.assertEqual(discovered['id'],'website:example.com');self.assertEqual(s['website'],'https://example.com')
    def test_employer_from_job_metadata(self):
        j=m.schema_normalize({'title':'Developer','hiringOrganization':{'name':'New Employer','sameAs':'https://new-employer.example'},'url':'https://jobs.ashbyhq.com/new-employer/123','jobLocation':{'address':{'addressCountry':'SG'}}},'https://example.com/jobs')
        self.assertEqual(j['employerName'],'New Employer');self.assertEqual(j['countryCodes'],['SG'])
        self.assertEqual(m.company_source(j['employerName'],j['employerWebsite'],'posting')['id'],'website:new-employer.example')
        self.assertEqual(m.feed_source(j['jobUrl'],j['employerName'])['id'],'ashby:new-employer')
    def test_company_deduplication(self):
        self.assertEqual(m.website_key('https://www.example.com/careers'),m.website_key('https://example.com/'))
        self.assertIsNone(m.company_source('Example','https://linkedin.com/company/example','posting'))
        self.assertIsNone(m.company_source('Example','http://127.0.0.1','posting'))
    def test_international_posting_is_retained(self):
        with patch.object(m,'fetch',return_value=('<html>Apply</html>','https://jobs.example.com/roles/123')):
            row=m.normalize({'title':'Engineer','location':'Singapore','applyUrl':'https://jobs.example.com/roles/123','descriptionPlain':'We offer visa sponsorship.'},{'id':'test','name':'Test','kind':'html'}, {})
        self.assertIsNotNone(row);self.assertEqual(row['location'],'Singapore');self.assertEqual(row['canada_evidence'],'')
    def test_large_refresh_batches_finalize_once(self):
        rows=[{'id':str(i),'description':'x'*24000} for i in range(140)]
        result={'source':{'id':'test'},'run_id':'run','jobs':rows,'complete':True,'error':'','seen_ids':[j['id'] for j in rows],'closed_ids':[]}
        with patch.object(m,'api') as api:m.save_result(result)
        packets=[c.args[1] for c in api.call_args_list]
        self.assertEqual(sum(len(p['jobs']) for p in packets),140)
        self.assertEqual(sum(not p['partial'] for p in packets),1)
        self.assertTrue(packets[-1]['complete']);self.assertEqual(len(packets[-1]['seen_ids']),140)
        self.assertTrue(all(len(json.dumps(p).encode())<2_000_000 for p in packets))
    def test_deadlines(self):
        self.assertEqual(m.deadline_iso('November 4'),'')
        self.assertEqual(m.deadline_iso('November 4, 2026'),'2026-11-04')
        self.assertEqual(m.deadline_iso('June 31, 2026'),'')
    def test_public_post_never_receives_private_secret(self):
        m.DIRECT=True;m.ORIGIN='https://private.example';m.TOKEN='private-updater-value'
        with patch.object(m,'urlopen',return_value=Response()) as open:
            m.fetch('https://example.com/careers',data={'offset':20},source={'id':'test'})
            request=open.call_args.args[0]
            self.assertEqual(request.get_method(),'POST')
            self.assertEqual(json.loads(request.data),{'offset':20})
            self.assertNotIn('Authorization',request.headers)
            self.assertNotIn('X-vercel-protection-bypass',request.headers)
    def test_ambiguous_salary_not_ranked(self):
        self.assertIsNone(m.compensation({},'The salary range is $80,000–$100,000 per year.'))
        pay=m.compensation({},'The salary range is CAD $80,000–$100,000 per year.')
        self.assertEqual(pay['annual_max_cad'],100000)
if __name__=='__main__':unittest.main()

