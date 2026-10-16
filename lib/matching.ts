// Deterministic matching. No model, embeddings, remote résumé service or hiring prediction.
export const MATCH_VERSION=2;
const CATALOG:Record<string,string[]>={
 Python:['python'],Java:['java'],JavaScript:['javascript','js'],TypeScript:['typescript'],SQL:['sql'],PostgreSQL:['postgresql','postgres'],MySQL:['mysql'],MongoDB:['mongodb'],Redis:['redis'],Go:['golang'],Rust:['rust'],'C++':['c++'],'C#':['c#'],Swift:['swift'],Kotlin:['kotlin'],Ruby:['ruby'],PHP:['php'],MATLAB:['matlab'],R:['r programming','r language'],
 React:['react','react.js','reactjs'],'Node.js':['node.js','nodejs'],'Next.js':['next.js','nextjs'],Angular:['angular'],Vue:['vue','vue.js'],Django:['django'],Flask:['flask'],FastAPI:['fastapi'],Spring:['spring boot'],'.NET':['.net','dotnet'],HTML:['html'],CSS:['css'],GraphQL:['graphql'],'REST APIs':['rest api','restful'],
 AWS:['aws','amazon web services'],Azure:['azure'],'Google Cloud':['gcp','google cloud'],Docker:['docker'],Kubernetes:['kubernetes','k8s','aks','eks'],'CI/CD':['ci/cd','continuous integration','continuous delivery'],Terraform:['terraform'],Linux:['linux'],Git:['git'],Jenkins:['jenkins'],Ansible:['ansible'],Bash:['bash','shell scripting'],Networking:['networking','tcp/ip','dns'],
 'Machine learning':['machine learning'],PyTorch:['pytorch'],TensorFlow:['tensorflow'],pandas:['pandas'],NumPy:['numpy'],OpenCV:['opencv'],MLflow:['mlflow'],MLOps:['mlops'],LLMs:['llm','llms','large language models'],RAG:['rag','retrieval augmented generation','retrieval-augmented generation'],'Power BI':['power bi'],Tableau:['tableau'],Spark:['apache spark','pyspark'],Kafka:['kafka'],
 Cybersecurity:['cybersecurity','cyber security','information security'],SIEM:['siem'],IAM:['identity and access management','iam'],'Active Directory':['active directory'],SCCM:['sccm','configuration manager'],Salesforce:['salesforce'],SAP:['sap'],Excel:['excel'],Agile:['agile','scrum'],JUnit:['junit'],Selenium:['selenium'],Playwright:['playwright'],
 AutoCAD:['autocad'],SolidWorks:['solidworks'],CATIA:['catia'],Revit:['revit'],ANSYS:['ansys'],'Finite element analysis':['finite element analysis','fea'],'Circuit design':['circuit design'],PCB:['pcb','printed circuit board'],Verilog:['verilog'],VHDL:['vhdl'],FPGA:['fpga'],PLC:['plc'],Simulink:['simulink'],'Embedded systems':['embedded systems'],CAD:['cad','computer aided design','computer-aided design'],HVAC:['hvac'],Robotics:['robotics'],ROS:['ros2','robot operating system'],
 'Customer support':['customer support','customer service','client service'],'Technical support':['technical support','it support','ticket resolution'],Presentations:['presentations','presenting','workshops'],'Project management':['project management'],'Data analysis':['data analysis','data analytics'],
};
const escape=(s:string)=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const patterns=Object.entries(CATALOG).map(([name,aliases])=>({name,re:new RegExp('(?:^|[^a-z0-9])(?:'+aliases.map(escape).join('|')+')(?=$|[^a-z0-9])','i')}));
export const SKILLS=Object.keys(CATALOG).sort();
export function skillsIn(text:string){
 // Currency codes and ordinary verbs must not become technical skills.
 const clean=text.replace(/(?:[$€£]\s*[\d,.]+\s*CAD\b|\bCAD\s*[$]?\s*[\d,.]+|[\d,.]+\s*CAD\b)/gi,' ');
 return patterns.filter(p=>p.re.test(p.name==='Excel'?clean.replace(/\bexcel\s+(?:at|in|with)\b/gi,' '):clean)).map(p=>p.name);
}
const ROLE_RULES:Record<string,RegExp>={
 'Software development':/software|developer|full.?stack|front.?end|back.?end|web engineer/i,
 'Cloud & DevOps':/cloud|devops|infrastructure|site reliability|platform engineer|\bsre\b/i,
 'Solutions engineering':/solutions? (?:engineer|architect|consultant)|sales engineer|technical account/i,
 'AI & data':/machine learning|data (?:scientist|engineer|analyst)|\bai\b|ml engineer|research scientist/i,
 'Cybersecurity':/security|cyber|\bsoc\b/i,'IT & support':/\bit\b|information technology|support|systems administrator/i,
 'Electrical & electronics':/electrical|electronics|circuit|fpga|hardware|semiconductor/i,
 'Mechanical & manufacturing':/mechanical|manufacturing|industrial|mechatronic/i,
 'Civil & environmental':/civil|structural|environmental|geotechnical/i,
 'Chemical & biomedical':/chemical|biomedical|bioprocess|process engineer/i,
};
export const ROLE_OPTIONS=Object.keys(ROLE_RULES);
export const DEGREE_OPTIONS=['Not specified','High school','Associate / diploma',"Bachelor's","Master's",'Doctorate'];
export type MatchProfile={version:1;skills:string[];evidenceSkills:string[];roles:string[];stage:string;years:number|null;degree:number;graduationYear:number|null;degreeComplete:boolean;needsSponsorship:string[];};
export const emptyProfile=():MatchProfile=>({version:1,skills:[],evidenceSkills:[],roles:[],stage:'Any',years:null,degree:0,graduationYear:null,degreeComplete:false,needsSponsorship:[]});
function degreeIn(s:string){return /\b(?:ph\.?d|doctorate|doctoral)\b/i.test(s)?5:/\b(?:master'?s?|m\.?sc|mba)\b/i.test(s)?4:/\b(?:bachelor'?s?|b\.?sc|b\.?s\.|b\.?eng)\b/i.test(s)?3:/\b(?:associate|diploma)\b/i.test(s)?2:/high school/i.test(s)?1:0;}
export function parseResume(text:string):MatchProfile{
 const p=emptyProfile(),s=text.slice(0,60000);p.skills=skillsIn(s);
 const body=s.match(/(?:^|\n)\s*(?:work\s+|professional\s+)?(?:experience|projects)\s*\n([\s\S]*)/i)?.[1]||'';
 p.evidenceSkills=skillsIn(body.split(/(?:^|\n)\s*(?:technical skills|skills\s*&|skills|awards|certifications)\b/i)[0]);
 const education=s.match(/(?:^|\n)\s*education\s*\n([\s\S]*?)(?=\n\s*(?:experience|projects|skills|summary)\s*\n|$)/i)?.[1]||'';
 p.degree=degreeIn(education);const dates=[...education.matchAll(/\b(20\d{2})\b/g)].map(m=>Number(m[1]));
 if(dates.length)p.graduationYear=Math.max(...dates);
 // Never infer authorization, completed degrees, or professional years from résumé dates.
 return p;
}
export function validateProfile(value:unknown):MatchProfile|null{
 if(!value||typeof value!=='object')return null;const p=value as MatchProfile;
 if(p.version!==1||!Array.isArray(p.skills)||!Array.isArray(p.evidenceSkills)||!Array.isArray(p.roles)||!Array.isArray(p.needsSponsorship))return null;
 return {...emptyProfile(),skills:[...new Set(p.skills.filter(s=>SKILLS.includes(s)))],evidenceSkills:[...new Set(p.evidenceSkills.filter(s=>SKILLS.includes(s)&&p.skills.includes(s)))],roles:p.roles.filter(r=>ROLE_OPTIONS.includes(r)),stage:['Any','Internship','Entry level','Intermediate','Senior','Management'].includes(p.stage)?p.stage:'Any',years:typeof p.years==='number'&&Number.isFinite(p.years)&&p.years>=0&&p.years<=60?p.years:null,degree:Number.isInteger(p.degree)&&p.degree>=0&&p.degree<=5?p.degree:0,graduationYear:Number.isInteger(p.graduationYear)&&p.graduationYear!>=1950&&p.graduationYear!<=2100?p.graduationYear:null,degreeComplete:p.degreeComplete===true,needsSponsorship:p.needsSponsorship.filter(c=>['Canada','United States'].includes(c))};
}
export type JobSignals={version:2;skills:string[];required:string[];preferred:string[];evidence:string[];years:number|null;degree:number;equivalent:boolean;studying:boolean;graduation:number[];roles:string[];};
export function jobSignals(position:string,description=''):JobSignals{
 // ATS descriptions often flatten every heading and bullet into one paragraph.
 // Scope matching to role qualifications/responsibilities when headings are present.
 const headings=/\b(what (?:we['’]re|we are) looking for|what you(?:'ll|’ll| will) bring|what you bring|minimum qualifications|basic qualifications|required qualifications|preferred qualifications|requirements|required skills|qualifications|bonus points for|nice to have|preferred skills|responsibilities|what you(?:'ll|’ll| will) do|what you can expect|what we offer|our culture|how we work with AI|our approach to remote work|you belong here|benefits|compensation|(?:USA|Canada)-based roles only)\s*:?/gi;
 let s=description.slice(0,24000).replace(headings,'\n$1\n');
 const first=s.search(/\n(?:what (?:we['’]re|we are) looking for|what you(?:'ll|’ll| will) bring|what you bring|minimum qualifications|basic qualifications|required qualifications|requirements|required skills|qualifications|responsibilities|what you(?:'ll|’ll| will) do)\n/i);
 if(first>=0)s=s.slice(first);
 s=s.split(/\n(?:what we offer|our culture|how we work with AI|our approach to remote work|you belong here|benefits|compensation|(?:USA|Canada)-based roles only)\n/i)[0];
 s=s.replace(/[^.!?\n]*(?:screening of (?:employment )?applications|recruitment process|equal opportunity employer|candidate privacy)[^.!?\n]*[.!?]?/gi,' ');
 const required=new Set<string>(),preferred=new Set<string>(),evidence:string[]=[],eligible=new Set<string>();
 let section='';const parts=s.split(/\n|\s+-\s+|[.!?;](?:\s|$)/).map(x=>x.trim()).filter(Boolean);
 for(const line of parts){
  if(line.length<100&&/^(?:preferred qualifications|nice to have|bonus|preferred skills|desirable)/i.test(line))section='preferred';
  else if(line.length<100&&/^(?:minimum qualifications|basic qualifications|requirements|required skills|required qualifications|what you bring|what (?:we['’]re|we are) looking for|what you(?:'ll|’ll| will) bring|qualifications)/i.test(line))section='required';
  else if(line.length<100&&/^(?:benefits|about us|what we offer|responsibilities|what you(?:'ll|’ll| will) do|what you can expect)/i.test(line))section='';
  if(/not required|no .{0,40} required|don't need|do not need/i.test(line))continue;
  const terms=skillsIn(line);for(const term of terms)eligible.add(term);const optional=/preferred|nice.to.have|a plus|bonus|optional|desirable/i.test(line)||section==='preferred';
  const mandatory=!optional&&(/\brequired\b|\bmust\b|minimum|proficien|experience (?:with|in)|knowledge of/i.test(line)||section==='required');
  for(const skill of terms)if(optional)preferred.add(skill);else if(mandatory)required.add(skill);
  if(terms.length&&(mandatory||optional)&&evidence.length<3)evidence.push(line.slice(0,240));
 }
 for(const skill of required)preferred.delete(skill);
 const yearLines=parts.filter(x=>!/preferred|a plus|bonus|optional|not required/i.test(x));
 const years=yearLines.flatMap(line=>[...line.matchAll(/\b(\d{1,2})(?:\s*[-–]\s*\d{1,2})?\+?\s+years?\s+(?:of\s+)?(?:relevant\s+|professional\s+|work\s+|industry\s+)?experience\b/gi)].map(m=>Number(m[1])));
 const education=yearLines.filter(x=>/degree|bachelor|master|doctorate|ph\.?d/i.test(x)).join(' ');
 const grad=parts.filter(x=>/graduat(?:e|ing|ion)/i.test(x)).flatMap(x=>[...x.matchAll(/\b(20\d{2})\b/g)].map(m=>Number(m[1])));
 // If alternatives are listed, use the least restrictive named degree.
 const degrees=[1,2,3,4,5].filter(n=>education.split(/\bor\b|\/|,/i).some(x=>degreeIn(x)===n));
 return {version:2,skills:[...eligible],required:[...required],preferred:[...preferred],evidence,years:years.length?Math.max(...years):null,degree:degrees.length?Math.min(...degrees):0,equivalent:/equivalent (?:experience|practical)|experience (?:in lieu|instead)/i.test(education),studying:/pursuing|enrolled|working toward|currently studying/i.test(education),graduation:[...new Set(grad)].sort(),roles:Object.entries(ROLE_RULES).filter(([,re])=>re.test(position)).map(([name])=>name)};
}
export type MatchJob={position:string;seniority:string;description?:string;match_signals?:JobSignals;international:{countries:string[];sponsorship:string;us_sponsorship:string;restrictions:string[]}};
export type MatchResult={score:number|null;coverage:number;matched:string[];missing:string[];preferredMissing:string[];checks:{label:string;earned:number;weight:number;detail:string}[];unknown:string[];eligibility:string[];evidence:string[];};
export function scoreJob(job:MatchJob,p:MatchProfile):MatchResult{
 const s=job.match_signals?.version===MATCH_VERSION?job.match_signals:jobSignals(job.position,job.description);
 const required=s.required.length?s.required:s.skills.filter(x=>!s.preferred.includes(x)),matched=required.filter(x=>p.skills.includes(x)),missing=required.filter(x=>!p.skills.includes(x));
 const checks:MatchResult['checks']=[],unknown:string[]=[];
 const add=(label:string,ratio:number,weight:number,detail:string)=>checks.push({label,earned:Math.round(ratio*weight*10)/10,weight,detail});
 if(required.length)add(s.required.length?'Required skills':'Skills mentioned',matched.length/required.length,40,`${matched.length} of ${required.length} recognized skills supported. ${s.required.length?'':'Requirement level is unclear.'}`);else unknown.push('No recognizable core skills in the posting');
 const evidenceMatches=required.filter(x=>p.evidenceSkills.includes(x));
 if(required.length)add('Experience & project evidence',evidenceMatches.length/required.length,15,`${evidenceMatches.length} relevant skills marked as demonstrated in experience or projects.`);
 if(s.years!==null&&p.years!==null)add('Experience duration',s.years===0?1:Math.min(1,p.years/s.years),10,`${p.years} confirmed relevant years; posting asks for ${s.years}+.`);else unknown.push(s.years===null?'Experience duration not clearly specified':'Confirm your relevant experience years');
 if(p.stage!=='Any'&&job.seniority!=='Unspecified')add('Career stage',p.stage===job.seniority?1:0,10,`${job.seniority} role; you selected ${p.stage}.`);else unknown.push('Career stage comparison unavailable');
 if(p.roles.length&&s.roles.length)add('Preferred fields',p.roles.some(r=>s.roles.includes(r))?1:0,10,s.roles.join(', '));else unknown.push(p.roles.length?'Role field is unclear':'All fields have equal priority');
 if(s.degree&&p.degree&&!s.equivalent)add('Education',p.degree>=s.degree&&(p.degreeComplete||s.studying)?1:0,8,`${DEGREE_OPTIONS[s.degree]} ${s.studying?'study accepted':'required'}; your degree is ${p.degreeComplete?'completed':'in progress'}.`);else unknown.push(s.equivalent?'Equivalent-experience education route needs review':'Education comparison unavailable');
 if(s.graduation.length&&p.graduationYear)add('Graduation window',p.graduationYear>=Math.min(...s.graduation)&&p.graduationYear<=Math.max(...s.graduation)?1:0,7,`Posting mentions graduation ${s.graduation.join('–')}; yours is ${p.graduationYear}.`);else unknown.push('Graduation window comparison unavailable');
 const coverage=checks.reduce((n,c)=>n+c.weight,0),earned=checks.reduce((n,c)=>n+c.earned,0),eligibility=[...job.international.restrictions];
 for(const country of p.needsSponsorship)if(job.international.countries.includes(country)){const label=country==='United States'?job.international.us_sponsorship:job.international.sponsorship;eligibility.push(`${country} sponsorship: ${label}. Confirm eligibility with the employer.`);}
 return {score:coverage>=40?Math.round(100*earned/coverage):null,coverage,matched,missing,preferredMissing:s.preferred.filter(x=>!p.skills.includes(x)),checks,unknown,eligibility,evidence:s.evidence};
}
