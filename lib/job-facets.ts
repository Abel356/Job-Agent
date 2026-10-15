import employers from '../data/employer-groups.json';
export const ENGINEERING=['Electrical & Electronics','Mechanical','Civil & Structural','Chemical & Process','Industrial & Manufacturing','Aerospace','Biomedical','Environmental','Materials','Robotics & Controls','Hardware & Embedded','Software','Data & Machine Learning','Systems & Reliability','Engineering — other'];
export const COMPANY_GROUPS=['Fortune 500','a16z Speedrun','Major employers','Ashby','Greenhouse','Lever','Workday','Other careers sites'];
export const employerKey=(name:string)=>name.toLowerCase().replace(/\b(?:incorporated|inc|corp|corporation|limited|ltd|llc|platforms)\b/g,'').replace(/[^a-z0-9]/g,'').replace(/^amazoncom$/,'amazon').replace(/^facebook$/,'meta').replace(/^google$/,'alphabet');
const fortune=new Set(employers.fortune.map(employerKey)),speedrun=new Set(employers.speedrun.map(employerKey));
const major=new Set(['Amazon','Tesla','Meta','Microsoft','Apple','Google','Nvidia','Netflix','Adobe','Intel','AMD','IBM','Oracle','Salesforce','Shopify','Uber','Airbnb','Spotify','Samsung'].map(employerKey));
export function companyGroups(j:{company?:string;source_id?:string;apply_url?:string;source_url?:string;company_groups?:string[]}){
 const groups=new Set(j.company_groups||[]),key=employerKey(j.company||'');
 if(fortune.has(key))groups.add('Fortune 500');if(speedrun.has(key))groups.add('a16z Speedrun');if(major.has(key))groups.add('Major employers');
 const url=`${j.source_id||''} ${j.apply_url||''} ${j.source_url||''}`;
 groups.add(/ashby/i.test(url)?'Ashby':/greenhouse/i.test(url)?'Greenhouse':/lever[.:]/i.test(url)?'Lever':/workday/i.test(url)?'Workday':'Other careers sites');return [...groups];
}
export function engineeringDisciplines(j:{position?:string;department?:string}){
 const title=j.position||'',text=`${title} ${j.department||''}`;
 if(!/engineer|engineering|developer|scientist|architect|technician|robotic|firmware|embedded|\bCAD\b|\bVLSI\b|\bFPGA\b/i.test(title)||/sales engineer|solutions engineer|recruit|account manager/i.test(title))return [];
 const patterns=[/electrical|electronic|power systems|circuit|\bRF\b|\bPCB\b|semiconductor|\bVLSI\b|\bASIC\b/i,/mechanical|thermal|thermodynamic|fluid|HVAC|mechatronic/i,/civil|structural|geotechnical|transportation|water resources/i,/chemical|process engineer|petroleum|refinery/i,/industrial|manufactur|production engineer|quality engineer|supply chain engineer/i,/aerospace|aeronaut|avionics|propulsion|flight|spacecraft/i,/biomedical|biomechanic|medical device/i,/environmental|wastewater|remediation/i,/materials|metallurg|polymer|battery|batteries/i,/robotic|controls? engineer|automation|mechatronic|autonomous|autonomy/i,/hardware|embedded|firmware|\bFPGA\b|\bASIC\b|\bVLSI\b/i,/software|developer|frontend|front.end|backend|back.end|full.stack|mobile|\bSDE\b/i,/data engineer|data scien|machine learning|\bML\b|\bAI\b|artificial intelligence/i,/systems engineer|reliability|\bSRE\b|devops|infrastructure|platform engineer|network engineer|security engineer/i];
 const found=patterns.flatMap((re,i)=>re.test(text)?[ENGINEERING[i]]:[]);return found.length?found:['Engineering — other'];
}
