"""Read-only production checks using the protected updater credential."""
import importlib.util
import json
import time
from pathlib import Path

spec = importlib.util.spec_from_file_location('collector', Path(__file__).with_name('refresh_jobs.py'))
collector = importlib.util.module_from_spec(spec)
spec.loader.exec_module(collector)

for attempt in range(15):
    try:
        page = collector.api('jobs')
        assert page.get('settings', {}).get('static_mode') is True, 'Tech snapshot deployment is not ready'
        assert page.get('jobs'), 'No active tech roles returned'
        assert all(j.get('match_signals', {}).get('version') == 2 for j in page['jobs']), 'Match signals missing'
        assert all('description' not in j for j in page['jobs']), 'List endpoint must omit full descriptions'
        assert all(j.get('priority_label') and j.get('tech_stack') and j.get('source_label') for j in page['jobs']), 'Job context missing'
        sample = page['jobs'][0]
        detail = collector.api('job/' + sample['id'])
        assert detail['match_signals'] == sample['match_signals'], 'List and detail match signals disagree'
        if page.get('next_cursor'):
            next_page = collector.api('jobs?summary=0&after=' + page['next_cursor'])
            assert 'runs' not in next_page and 'settings' not in next_page, 'Continuation repeated summary data'
            assert not {j['id'] for j in page['jobs']} & {j['id'] for j in next_page['jobs']}, 'Pagination returned duplicate jobs'
        sources = collector.api('sources')['sources']
        assert any(s['id'] == 'simplify:new-grad' for s in sources), 'Simplify source missing'
        body, _ = collector.fetch(collector.ORIGIN + '/pdf.worker.min.mjs')
        assert 'pdfjs' in body.lower() and '<html' not in body[:500].lower(), 'PDF worker is not available'
        print(json.dumps({'status': 'passed', 'sampled_jobs': len(page['jobs']), 'checks': ['private static job API', 'match signals', 'priority labels', 'detail', 'pagination', 'Simplify source', 'browser PDF worker']}))
        break
    except collector.DatabaseQuotaExceeded:
        raise
    except Exception as error:
        if attempt == 14:
            raise
        print('Waiting for production rollout:', type(error).__name__, flush=True)
        time.sleep(20)
