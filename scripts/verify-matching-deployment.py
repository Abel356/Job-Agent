"""Read-only production checks using the protected updater credential."""
import importlib.util
import json
import time
from pathlib import Path
from urllib.error import HTTPError

spec = importlib.util.spec_from_file_location('collector', Path(__file__).with_name('refresh_jobs.py'))
collector = importlib.util.module_from_spec(spec)
spec.loader.exec_module(collector)

def public_api(path, data=None):
    updater_token = collector.TOKEN
    collector.TOKEN = ''
    try:
        return collector.api(path, data)
    finally:
        collector.TOKEN = updater_token

for attempt in range(15):
    try:
        assert collector.api('refresh-protocol').get('version') == 2, 'Updater access is unavailable'
        try:
            public_api('refresh-protocol')
        except HTTPError as error:
            assert error.code == 401, 'Maintenance GET returned an unexpected status'
        else:
            raise AssertionError('Maintenance GET is publicly accessible')
        try:
            public_api('category', {'id': 'test', 'category': 'Technology'})
        except HTTPError as error:
            assert error.code == 401, 'Maintenance POST returned an unexpected status'
        else:
            raise AssertionError('Maintenance POST is publicly accessible')
        page = public_api('jobs')
        assert page.get('settings', {}).get('static_mode') is True, 'Tech snapshot deployment is not ready'
        assert page.get('jobs'), 'No active tech roles returned'
        assert all(j.get('match_signals', {}).get('version') == 2 for j in page['jobs']), 'Match signals missing'
        assert all('description' not in j for j in page['jobs']), 'List endpoint must omit full descriptions'
        assert all(j.get('priority_label') and j.get('tech_stack') and j.get('source_label') for j in page['jobs']), 'Job context missing'
        sample = page['jobs'][0]
        detail = public_api('job/' + sample['id'])
        assert detail['match_signals'] == sample['match_signals'], 'List and detail match signals disagree'
        if page.get('next_cursor'):
            next_page = public_api('jobs?summary=0&after=' + page['next_cursor'])
            assert 'runs' not in next_page and 'settings' not in next_page, 'Continuation repeated summary data'
            assert not {j['id'] for j in page['jobs']} & {j['id'] for j in next_page['jobs']}, 'Pagination returned duplicate jobs'
        sources = public_api('sources')['sources']
        assert any(s['id'] == 'simplify:new-grad' for s in sources), 'Simplify source missing'
        body, _ = collector.fetch(collector.ORIGIN + '/pdf.worker.min.mjs')
        assert 'pdfjs' in body.lower() and '<html' not in body[:500].lower(), 'PDF worker is not available'
        print(json.dumps({'status': 'passed', 'sampled_jobs': len(page['jobs']), 'checks': ['public static job API', 'blocked maintenance GET and POST', 'match signals', 'priority labels', 'detail', 'pagination', 'Simplify source', 'browser PDF worker']}))
        break
    except collector.DatabaseQuotaExceeded:
        raise
    except Exception as error:
        if attempt == 14:
            raise
        print('Waiting for production rollout:', type(error).__name__, flush=True)
        time.sleep(20)
