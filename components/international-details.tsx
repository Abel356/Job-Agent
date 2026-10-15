import type {Job} from '@/lib/jobs';

export function InternationalDetails({job}:{job:Job}){
 const i=job.international;
 return <div className="detail-section">
  <h3>Location & work eligibility</h3>
  <dl className="detail-facts">
   <dt>Job countries</dt><dd>{i.countries.join(' · ')||'Not stated / unclear'}</dd>
   <dt>Visa sponsorship</dt><dd>{i.sponsorship}</dd>
   {i.countries.includes('United States')&&<><dt>US sponsorship</dt><dd>{i.us_sponsorship}</dd></>}
   <dt>Remote scope</dt><dd>{i.remote_scope.join(' · ')}</dd>
   <dt>Student opportunities</dt><dd>{i.student_tags.join(' · ')||'Not stated'}</dd>
   <dt>Stated restrictions</dt><dd>{i.restrictions.join(' · ')||'None detected; confirm with employer'}</dd>
  </dl>
  {i.sponsorship_evidence.length>0&&<><h4>Sponsorship wording</h4>{i.sponsorship_evidence.map((s,n)=><blockquote key={n}>{s}</blockquote>)}</>}
  {i.student_evidence.length>0&&<><h4>Career-stage & student eligibility evidence</h4>{i.student_evidence.map((s,n)=><blockquote key={n}>{s}</blockquote>)}</>}
  {i.restriction_evidence.length>0&&<><h4>Work restrictions</h4>{i.restriction_evidence.map((s,n)=><blockquote key={n}>{s}</blockquote>)}</>}
  <p className="coverage-note">Labels are based on the posting and may be incomplete. A Canadian work permit does not authorize work in the US. US sponsorship requires the applicable US authorization; OPT/CPT concerns US student status. For work performed remotely from Canada, confirm that the employer can hire in Canada and that your Canadian authorization permits the work.</p>
  <a className="source-link" href="https://www.uscis.gov/working-in-the-united-states" target="_blank" rel="noopener noreferrer">US work authorization information</a>
 </div>;
}
