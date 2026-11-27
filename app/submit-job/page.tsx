'use client';
import {useState,type FormEvent} from 'react';
import Link from 'next/link';

export default function SubmitJob(){
 const [company,setCompany]=useState(''),[title,setTitle]=useState(''),[location,setLocation]=useState(''),[url,setUrl]=useState(''),[contact,setContact]=useState(''),[details,setDetails]=useState('');
 function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();
  const body=`Company: ${company}\nRole: ${title}\nLocation and remote eligibility: ${location}\nOfficial application URL: ${url}\nContact email: ${contact}\nSponsorship / tech stack details: ${details||'Not provided'}\n\nPlease verify this role before publishing.`;
  window.location.href=`mailto:abelpayyanickal@gmail.com?subject=${encodeURIComponent(`Earthwork job submission: ${company} — ${title}`)}&body=${encodeURIComponent(body)}`;
 }
 return <main className="submit-page"><Link href="/" className="submit-back">← Back to jobs</Link><div className="submit-card"><p className="eyebrow">FOR EMPLOYERS</p><h1>Submit a tech job</h1><p>Send a Canadian or remote US tech role for review. We publish verified roles with a link to your official application page. Your email app will open with the details ready to send.</p><form onSubmit={submit}><label>Company name<input required maxLength={100} value={company} onChange={e=>setCompany(e.target.value)}/></label><label>Role title<input required maxLength={150} value={title} onChange={e=>setTitle(e.target.value)}/></label><label>Location and remote eligibility<input required maxLength={180} value={location} onChange={e=>setLocation(e.target.value)} placeholder="Toronto, ON or Remote, US"/></label><label>Official application URL<input required type="url" pattern="https://.*" value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://your-company.com/careers/..."/></label><label>Your work email<input required type="email" value={contact} onChange={e=>setContact(e.target.value)}/></label><label>Sponsorship or tech stack details (optional)<textarea rows={4} maxLength={1000} value={details} onChange={e=>setDetails(e.target.value)} placeholder="Include a link to any published sponsorship guidance."/></label><button type="submit">Open email to submit</button></form><p className="submit-fine">Submissions are reviewed before publication. A submitted role is not automatically listed or sponsored.</p></div></main>;
}
