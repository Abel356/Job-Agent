"""Read-only production checks using the existing protected updater credential."""
import importlib.util,json,time
from pathlib import Path
spec=importlib.util.spec_from_file_location('collector',Path(__file__).with_name('refresh_jobs.py'))
collector=importlib.util.module_from_spec(spec);spec.loader.exec_module(collector)
expected=json.loads(Path('data/employer-discovery.json').read_text())
expected_ids={s['id'] for s in expected['indexes']+expected['boards']}
for attempt in range(30):
    try:
        page=collector.api('jobs')
        assert page.get('jobs'), 'No active jobs returned'
        assert all(j.get('match_signals',{}).get('version')==1 for j in page['jobs']), 'Deployment is not serving match signals yet'
        assert all('description' not in j for j in page['jobs']), 'List endpoint must omit full descriptions'
        sample=page['jobs'][0]
        detail=collector.api('job/'+sample['id'])
        assert detail['match_signals']==sample['match_signals'], 'List and detail match signals disagree'
        if page.get('next_cursor'):
            next_page=collector.api('jobs?after='+page['next_cursor'])
            assert not {j['id'] for j in page['jobs']} & {j['id'] for j in next_page['jobs']}, 'Pagination returned duplicate jobs'
        sources=collector.api('sources')['sources'];ids={s['id'] for s in sources}
        assert expected_ids<=ids, 'Employer registration has not completed'
        # The worker contains no private data and must be served as an actual asset.
        body,_=collector.fetch(collector.ORIGIN+'/pdf.worker.min.mjs')
        assert 'pdfjs' in body.lower() and '<html' not in body[:500].lower(), 'PDF worker is not available'
        print(json.dumps({'status':'passed','sampled_jobs':len(page['jobs']),'registered_discovery_boards':len(expected['boards']),'checks':['compact match signals','consistent detail scores','duplicate-free pagination','employer registry','browser PDF worker']}))
        break
    except Exception as error:
        if attempt==29:raise
        print('Waiting for production rollout:',type(error).__name__,flush=True)
        time.sleep(20)
