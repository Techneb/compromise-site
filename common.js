// Helpers shared by cities.html, coverage.html and overview.html (and _tests/common.test.js).
// The servers say max-age=300 with an ETag: the browser keeps each file 5 minutes, then asks whether it changed.
const get=u=>fetch(u).then(r=>{if(!r.ok)throw new Error(r.status);return r.json();});
const $=id=>document.getElementById(id);
// Feed text goes into HTML (rows, popups, tooltips) escaped.
const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const fmt=n=>n==null?'':Number(n).toLocaleString();
// A share: one decimal under 10 %, whole above, "< 0.1 %" for a sliver.
const pct=x=>x==null?'':x>0&&x<0.0005?'< 0.1 %':(100*x).toLocaleString(undefined,x<0.1?{minimumFractionDigits:1,maximumFractionDigits:1}:{maximumFractionDigits:0})+' %';
// Searches fold case, accents and ligatures ("sao" finds São, "wroclaw" Wrocław).
const fold=s=>String(s).normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/ł/g,'l').replace(/ø/g,'o').replace(/ß/g,'ss').replace(/æ/g,'ae').replace(/œ/g,'oe').replace(/đ/g,'d');
// Two cities can share a name (London, Canada): a join by name also needs the place to agree. An area's box must
// hold the city's point, give or take 12 km (the counts job's square), and a counts row's point lie within 12 km.
const KM=12, near=(la,lo,lb,lob)=>Math.hypot((la-lb)*111.32,(lo-lob)*111.32*Math.cos(la*Math.PI/180))<=KM;
const holds=(box,c)=>{if(c.lat==null)return true;const [s0,w,n,e]=box,dy=KM/111.32,dx=dy/Math.cos(c.lat*Math.PI/180);
  return c.lat>=s0-dy&&c.lat<=n+dy&&c.lon>=w-dx&&c.lon<=e+dx;};
// counts.json's row for a status row: same name, same country, within 12 km.
const countsRows=list=>{const cnt={};for(const c of list||[])(cnt[c.city]=cnt[c.city]||[]).push(c);
  return c=>(cnt[c.city]||[]).find(k=>(!k.country||k.country===c.country)&&(k.lat==null||c.lat==null||near(k.lat,k.lon,c.lat,c.lon)));};
// The ingestion ladder (owner, 2026-10-15; cities.html, overview.html): every step a city goes through, in order, read
// from the status feed's per-data fields (cities_status.py). A city's code is the first step it has not done ("done"
// past the last); a step that does not apply to it is skipped, never waited for. Stages 4 to 7 follow the owner's
// consolidation order: whole cities, then Home, then transit lines, then the checks.
const STAGES={1:'Found',2:'Surveyed',3:'Sun data',4:'Whole city',5:'Home',6:'Transit',7:'Checked'};
const LADDER=[
  ['1.1','Listed','Counted and over the survey rule, but no row in the city list yet.'],
  ['1.2','Counted','Its going-out blocks counted.'],
  ['1.3','Busy enough','At least the survey floor of going-out blocks; a quieter city is not surveyed.'],
  ['1.4','Planned','Kept for the survey, not set aside.'],
  ['2.1','Surveyed','Its own open-data portals surveyed for terraces and building heights.'],
  ['2.2','Portal reached','The city\'s portal answered (an unreachable one is retried).'],
  ['2.3','Decided','Data found and the owner\'s decision on it taken.'],
  ['2.4','Measured at a landmark','Its data counted at a landmark (terraces, buildings with a height).'],
  ['3.1','City data wired','The city\'s own terrace or height feed in the tile build. Skipped when it has none.'],
  ['3.2','Venues','Venue tiles built, with venues on record.'],
  ['3.3','Terraces','Terrace tiles built, with outdoor seating on record (a permit feed or OpenStreetMap).'],
  ['3.4','Buildings','Building tiles built, with blocks holding enough buildings for the sunny filter.'],
  ['3.5','Heights measured','Its districts measured from the tiles (wired cities wait here).'],
  ['3.6','Offered','The sunny filter offered: enough buildings and terraces where it was measured.'],
  ['4.1','Whole city','Tiled over the whole municipality, not only its core.'],
  ['5.1','Streets','Home\'s layers (streets, numbers, places, boundaries) built where it lies.'],
  ['5.2','Listing links','Home\'s listing sites wired for its country.'],
  ['6.1','Transit lines','Transit lines built where it lies. Skipped when it has no network.'],
  ['7.1','Seed check','EveryCityCheck passed at its seed; the cell names the last result (weather, no sun, no route, failed).'],
  ['7.2','Districts checked','The sunny filter offered in its districts on record, not only at its seed.'],
  ['done','Done','Every step that applies is done.']];
const LADDER_RANK=Object.fromEntries(LADDER.map((s,i)=>[s[0],i]));
// A status feed row's code.
const ladderCode=r=>{const s=r.status;
  if(s==='candidate')return '1.1';
  if(r.reason==='Not counted yet')return '1.2';
  if(r.reason==='Too quiet to survey')return '1.3';
  if(s==='not planned')return '1.4';
  if(s==='not surveyed')return '2.1';
  if(s==='unreachable')return '2.2';
  if(s==='held for the owner')return '2.3';
  if(s==='surveyed'||s==='to measure'||s==='landmark only')return '2.4';
  if(s==='found, to wire')return '3.1';
  if(s==='measured, not offered')return '3.6';   // measured, too few buildings or terraces: whatever its tiles
  if(r.venues!==true)return '3.2';
  if(!r.terraces||r.terraces==='none')return '3.3';
  if(r.buildings!==true)return '3.4';
  if(s==='wired, to measure')return '3.5';
  if(!r.offered)return '3.6';
  if(r.coverage!=='whole')return '4.1';
  if(!r.streets)return '5.1';
  if(!r.listings)return '5.2';
  if(r.transit==null)return '6.1';
  if(r.check!=='pass')return '7.1';
  if(!r.districtsOffered)return '7.2';
  return 'done';};
// The code's label: "3.2 · Venues", "7.1 · Seed check (weather)", "done".
const ladderStep=(code,r)=>code==='done'?'done':code+' · '+LADDER[LADDER_RANK[code]][1]+(code==='7.1'?' ('+(r&&r.check||'not run')+')':'');
// Consolidation (owner, 2026-10-15: no new cities): a row's stage ('1'..'7', 'done'), whether it is parked (stages 1 and 2,
// and the #441 batch the status feed marks `parked`), and the main-city order within a code: French cities first, then
// the most inhabitants (the owner's order is the capitals and big tourist cities, French first; no list holds it yet).
const stageOf=code=>code==='done'?'done':code.split('.')[0];
const parked=r=>!!r.parked||+stageOf(r.code)<=2;
const mainOrder=(a,b)=>(b.country==='France')-(a.country==='France')||(b.population||0)-(a.population||0)||a.city.localeCompare(b.city);
// Codes in the consolidation order: stages 4 → 7, done, then 3, 2, 1; sub-steps compared as numbers (3.2 before 3.10).
const CODE_ORDER=['4','5','6','7','done','3','2','1'];
const codeOrder=(a,b)=>CODE_ORDER.indexOf(stageOf(a))-CODE_ORDER.indexOf(stageOf(b))||(+a.split('.')[1]||0)-(+b.split('.')[1]||0);
// Rows by code (descending reverses the codes only), then the main-city order.
const byCode=asc=>(x,y)=>codeOrder(x.code,y.code)*(asc?1:-1)||mainOrder(x,y);
if(typeof module!=='undefined'&&module.exports)module.exports={esc,fmt,pct,fold,near,holds,countsRows,STAGES,LADDER,LADDER_RANK,ladderCode,ladderStep,stageOf,parked,mainOrder,CODE_ORDER,codeOrder,byCode};
