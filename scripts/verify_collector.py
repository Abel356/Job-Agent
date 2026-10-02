"""Checks deadline safety and credential isolation without network requests."""
import importlib.util,json,unittest
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
