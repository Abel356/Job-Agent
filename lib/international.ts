// Evidence labels describe the posting, never an applicant's immigration eligibility.
export const SPONSORSHIP = ['Explicitly offered','Explicitly unavailable','Conditional / case by case','Not stated / unclear'];
export const REMOTE_SCOPE = ['Canada remote stated','US remote stated','Worldwide remote stated','Remote with geographic limits','Remote location unclear','Not remote'];
export type International = {version:1|2;countries:string[];sponsorship:string;us_sponsorship:string;sponsorship_evidence:string[];student_tags:string[];student_evidence:string[];restrictions:string[];restriction_evidence:string[];remote_scope:string[]};
type Input = {location?:string;other_locations?:string;country_codes?:string[];workplace?:string;position?:string;description?:string;canada_evidence?:string;international?:International};
const isoCodes='AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'.split(' ');
const names=new Intl.DisplayNames(['en'],{type:'region'});
const countries=isoCodes.map(code=>({code,name:names.of(code)!}));
const alias:Record<string,string>={USA:'United States',US:'United States',UK:'United Kingdom',GB:'United Kingdom',CAN:'Canada',CA:'Canada','United States of America':'United States','U.S.':'United States','U.S.A.':'United States','U.K.':'United Kingdom'};
const escape=(s:string)=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const countryMatchers=countries.map(c=>({...c,pattern:new RegExp(`\\b${escape(c.name)}\\b`,'i')}));
const countryName=(s:string)=>alias[s]||countries.find(c=>c.code===s.toUpperCase())?.name||s;
export function jobCountries(j:Input){
 const found=new Set<string>((j.country_codes||[]).filter(Boolean).map(countryName));
 const text=`${j.location||''}; ${j.other_locations||''}`;
 for(const c of countryMatchers){if(c.pattern.test(text))found.add(c.name);}
 if(/,\s*(?:AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC)\b/.test(text))found.add('United States');
 if(/\b(?:USA|US|United States of America)\b|\bU\.S\.(?:A\.)?/.test(text))found.add('United States');
 if(/\b(?:UK|England|Scotland|Wales|Northern Ireland)\b|\bU\.K\./.test(text))found.add('United Kingdom');
 // Bare CA is ambiguous (California/Canada); accept only structured country codes.
 const clean=text.replace(/Vancouver\s*,?\s*(?:WA\b|Washington)|Ontario\s*,?\s*(?:CA\b|California|OH\b|Ohio)|Waterloo\s*,?\s*(?:IA\b|Iowa|Belgium)|Ottawa\s*,?\s*(?:IL\b|Illinois|KS\b|Kansas)|Halifax\s*,?\s*(?:VA\b|Virginia)|Toronto\s*,?\s*(?:OH\b|Ohio)/gi,'');
 if(/\b(?:Toronto|Montr[eé]al|Vancouver|Ottawa|Calgary|Edmonton|Kitchener|Waterloo|Mississauga|Winnipeg|Halifax|Quebec|British Columbia|Alberta|Saskatchewan|Manitoba|Nova Scotia|New Brunswick|Newfoundland|Prince Edward Island|Ontario)\b/i.test(clean))found.add('Canada');
 if(/\b(?:San Francisco|New York|NYC|Seattle|Boston|Los Angeles|San Diego|San Jose|San Leandro|Palo Alto|Mountain View|Austin|Chicago|Denver|Atlanta|Miami|Dallas|Houston|Washington|California|Massachusetts|Texas|Illinois|Colorado|Oregon|Pennsylvania|Florida|Michigan|Virginia|New Jersey|North Carolina)\b/i.test(text))found.add('United States');
 if(/\bLondon\b/i.test(text)&&!/(?:Ontario|Canada|London\s*,\s*ON)/i.test(text))found.add('United Kingdom');
 const cityRules:[string,RegExp][]=[['India',/\b(?:Bengaluru|Bangalore|Mumbai|Hyderabad|Chennai|New Delhi|Delhi|Pune|Gurugram|Gurgaon|Noida)\b/i],['Singapore',/\bSingapore\b/i],['Germany',/\b(?:Berlin|Munich|Hamburg)\b/i],['France',/\bParis\b/i],['Australia',/\b(?:Sydney|Melbourne|Brisbane)\b/i],['Netherlands',/\bAmsterdam\b/i],['Ireland',/\bDublin\b/i],['Japan',/\bTokyo\b/i]];
 if(!found.size)for(const [name,re] of cityRules)if(re.test(text))found.add(name);
 // The collector supplies this only when it found location/remote evidence.
 if(j.canada_evidence&&/^(Canada in (?:structured|listed) location|Remote Canada stated:)/.test(j.canada_evidence))found.add('Canada');
 if(found.has('United States')&&found.has('Georgia')&&!/Tbilisi/i.test(text)&&!(j.country_codes||[]).includes('GE'))found.delete('Georgia');
 return [...found].sort();
}
const sponsor=/\b(?:visa sponsorship|immigration sponsorship|work (?:visa|permit) sponsorship|sponsor(?:ship|ing)? (?:a |an |your |work |employment |h-?1b |visas?)*visas?|H-?1B|sponsorship)\b/i;
const negative=/\b(?:no|not|never|unable|cannot|can't|without|do not|does not|don't|doesn't|won't|will not|unavailable|not available|not eligible|not able)\b.{0,90}\b(?:sponsor\w*|visa)|\bsponsor\w*.{0,70}\b(?:not (?:available|provided|offered|supported)|unavailable|not possible)\b|\bmust not require.{0,50}sponsor/i;
const positive=/\b(?:we|company|employer)\s+(?:will|can|do|does|are able to)\s+(?:provide |offer |support )?(?:visa sponsorship|sponsor\b)|\b(?:offer|offers|offering|provide|provides|providing|support|supports|available|sponsor)\b.{0,40}\b(?:visa sponsorship|work visas?|H-?1B visas?)\b|\b(?:visa|immigration|H-?1B)\s+sponsorship\s+(?:(?:is|will be)\s+)?(?:available|provided|offered|supported)\b|\bwe sponsor (?:visas|H-?1B)\b/i;
const conditional=/\b(?:may|might|case.by.case|consider|considered|depending|subject to|eligible candidates|exception)\b/i;
function sponsorshipStatus(lines:string[]){
 const relevant=lines.filter(s=>sponsor.test(s));
 const no=relevant.some(s=>negative.test(s)),yes=relevant.some(s=>positive.test(s)&&!negative.test(s)&&!s.includes('?'));
 if(no&&yes)return SPONSORSHIP[3];
 if(no)return SPONSORSHIP[1];
 if(relevant.some(s=>conditional.test(s)&&!s.includes('?')))return SPONSORSHIP[2];
 return yes?SPONSORSHIP[0]:SPONSORSHIP[3];
}
export function internationalDetails(j:Input):International{
 if(j.international?.version===2&&j.description===undefined)return j.international;
 const countries=jobCountries(j),description=(j.description||'').replace(/<[^>]*>/g,' ').replace(/\r/g,'');
 const lines=description.split(/(?<=[.!?])\s+|\n+/).map(s=>s.trim()).filter(Boolean);
 const evidence=lines.filter(s=>sponsor.test(s)).map(s=>s.slice(0,700)).slice(0,8);
 const status=sponsorshipStatus(lines);
 const usMention=/\b(?:US|USA|United States|H-?1B)\b|\bU\.S\./i;
 const usLines=lines.filter(s=>sponsor.test(s)&&usMention.test(s));
 const genericLines=lines.filter(s=>!/\b(?:Canada|Canadian|UK|United Kingdom|India|Singapore|Australia|Germany|Europe)\b/i.test(s));
 // A generic promise on a multi-country job does not establish US sponsorship.
 let usStatus=countries.includes('United States')?sponsorshipStatus(usLines.length?usLines:countries.length===1?genericLines:[]):SPONSORSHIP[3];
 if(usLines.some(s=>/\b(?:not|except|excluding)\s+(?:(?:offered|available)\s+)?(?:(?:for|in)\s+)?(?:the\s+)?(?:US\b|USA\b|United States|U\.S\.)/i.test(s)))usStatus=SPONSORSHIP[1];
 const tags:string[]=[],studentEvidence:string[]=[],restrictions:string[]=[],restrictionEvidence:string[]=[];
 if(/\b(?:intern|internship|co-op|coop|student)\b/i.test(j.position||''))tags.push('Internship / co-op');
 const earlyTitle=/\b(?:new[ -]grads?|new[ -]graduates?|university[ -]grads?|recent[ -]graduates?|graduate|entry[ -]level|early[ -]career|junior|jr\.?|engineer[ -](?:i|1))\b/i.test(j.position||'');
 const senior=/\b(?:senior|sr|staff|principal|lead|manager|director|head|chief)\b/i.test(j.position||'');
 const earlyLines=lines.filter(s=>/\b(?:(?:new|recent|university|college)[ -]grads?(?:uates?)?\s+(?:are\s+)?(?:welcome|encouraged|eligible)|(?:open to|suitable for|designed for|seeking|hiring|welcome|encourage).{0,45}(?:new|recent|university|college)[ -]grads?(?:uates?)?|(?:entry[ -]level|early[ -]career)\s+(?:role|position|opportunit|program)|(?:0\s*[-–to]+\s*[12]|zero\s+to\s+(?:one|two))\s*years?\s+(?:of\s+)?(?:relevant |professional |work |industry )?experience|no\s+(?:prior |previous |professional |work )?experience\s+(?:is\s+)?(?:required|necessary))\b/i.test(s)&&!/(?:mentor|manage|supervise|coach).{0,50}(?:graduate|junior)|not (?:an? )?(?:entry|early)|not eligible/i.test(s));
 if(!senior&&(earlyTitle||earlyLines.length)){tags.push('New graduate / entry level');studentEvidence.push(...(earlyTitle?['Role title: '+j.position]:[]),...earlyLines.map(s=>s.slice(0,700)));}
 const opt=lines.filter(s=>/\b(?:OPT|CPT|optional practical training|curricular practical training)\b/.test(s));
 if(opt.length){tags.push('OPT / CPT mentioned');studentEvidence.push(...opt.map(s=>s.slice(0,700)));}
 const restrictionRules:[string,RegExp][]=[['Citizenship required',/\b(?:must (?:be|hold)|requires?|only|limited to).{0,60}(?:citizen|citizenship)|\b(?:citizenship|citizens only)\b.{0,35}(?:required|requirement)/i],['Permanent residency required',/\b(?:must (?:be|hold)|requires?|only|limited to).{0,60}(?:permanent residen|green card)|\b(?:permanent residency|green card)\b.{0,35}(?:required|requirement)/i],['Security clearance required',/\b(?:must|requires?|active|eligible for).{0,50}security clearance|\bsecurity clearance\b.{0,35}(?:required|requirement)/i],['Existing work authorization required',/\b(?:must|requires?).{0,50}(?:authorized|authorised|authorization|authorisation|right to work)|\b(?:authorized|authorised|eligible|right) to work.{0,70}without.{0,25}sponsor/i]];
 for(const [label,re] of restrictionRules){const hits=lines.filter(s=>re.test(s)&&!/regardless of|without regard|not required|do not require|does not require/i.test(s));if(hits.length){restrictions.push(label);restrictionEvidence.push(...hits.map(s=>s.slice(0,700)));}}
 const remote=/remote/i.test(`${j.workplace} ${j.location} ${j.other_locations}`),scopes:string[]=[];
 if(!remote)scopes.push(REMOTE_SCOPE[5]);
 else {
  const worldwide=/\b(?:remote (?:from )?anywhere (?:in the world)?|work (?:remotely )?from anywhere in the world|worldwide remote|remote worldwide|remote.{0,8}global|globally remote)\b/i.test(`${j.location}; ${j.other_locations}`)||lines.some(s=>/\b(?:work|remote).{0,25}(?:from anywhere in the world|worldwide|globally)\b/i.test(s)&&!/not |except |excluding|offices|customers|team members/i.test(s));
  if(worldwide)scopes.push(REMOTE_SCOPE[2]);
  if(countries.includes('Canada'))scopes.push(REMOTE_SCOPE[0]);
  if(countries.includes('United States'))scopes.push(REMOTE_SCOPE[1]);
  if(countries.length||/\b(?:EMEA|APAC|Europe|Americas|LATAM|North America)\b/.test(`${j.location} ${j.other_locations}`))scopes.push(REMOTE_SCOPE[3]);
  if(!scopes.length)scopes.push(REMOTE_SCOPE[4]);
 }
 return {version:2,countries,sponsorship:status,us_sponsorship:usStatus,sponsorship_evidence:evidence,student_tags:tags,student_evidence:studentEvidence.slice(0,6),restrictions,restriction_evidence:[...new Set(restrictionEvidence)].slice(0,8),remote_scope:scopes};
}
