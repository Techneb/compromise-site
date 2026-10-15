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
// An area named as the whole city; past the name, the numbers: a core whose areas cover 85 % of the city's surface,
// or a tiled box holding 95 % of its square's going-out blocks, is the whole city.
const wholeName=a=>/whole|intra-muros|municipality|^greater /i.test(a.name)||a.name===a.city;
const wholeByNumbers=(c,km2,k)=>(!!c.cityAreaKm2&&km2/c.cityAreaKm2>=0.85)
  ||(!!k&&k.extent==='tiled box'&&k.goingOutCellsWide>0&&k.goingOutCoveredWide!=null&&k.goingOutCoveredWide/k.goingOutCellsWide>=0.95);
// The ingestion ladder (owner, 2026-10-15; cities.html): every step a city goes through, in order. A city's code is the
// first step it has not done ("done" past the last); a step that does not apply to it is skipped, never waited for.
// Stages 4 to 7 follow the owner's consolidation order: whole cities, then streets, then transit lines, then checks.
const LADDER=[
  ['1.1','Listed','Counted and over the survey rule, but no row in the city list yet.'],
  ['1.2','Counted','Its going-out blocks counted by the counts job.'],
  ['1.3','Busy enough','At least the survey floor of going-out blocks; a quieter city is not surveyed.'],
  ['1.4','Planned','Kept for the survey, not set aside.'],
  ['2.1','Surveyed','Its own open-data portals surveyed for terraces and building heights.'],
  ['2.2','Portal reached','The city\'s portal answered (an unreachable one is retried).'],
  ['2.3','Decided','Data found and the owner\'s decision on it taken.'],
  ['2.4','Measured','Its data counted at a landmark (terraces, buildings with a height).'],
  ['3.1','City data wired','The city\'s own terrace or height feed in the tile build. Skipped when it has none.'],
  ['3.2','Tiled','Venues, terraces and buildings tiles built: the sunny filter covers part of it.'],
  ['3.3','Offered','The sunny filter offered in a measured district: enough buildings and terraces on record.'],
  ['4.1','Whole city','Tiled over the whole municipality, not only its core.'],
  ['5.1','Streets','Home\'s layers (streets, numbers, places, boundaries) built where it lies.'],
  ['6.1','Transit lines','Transit lines built where it lies. Skipped when a build found no line.'],
  ['7.1','Checked in districts','The sunny filter checked on screen in its districts, not only at its seed.'],
  ['done','Done','Every step that applies is done.']];
const LADDER_RANK=Object.fromEntries(LADDER.map((s,i)=>[s[0],i]));
// A status row's code. x: covRank (0 none, 1 core, 2 whole), streets (true when a cities.json entry with streets
// holds it), lines (the most transit lines of an entry holding it; null when none was built, 0 built with no line).
const ladderCode=(r,x)=>{const s=r.status;
  if(s==='candidate')return '1.1';
  if(r.reason==='Not counted yet')return '1.2';
  if(r.reason==='Too quiet to survey')return '1.3';
  if(s==='not planned')return '1.4';
  if(s==='not surveyed')return '2.1';
  if(s==='unreachable')return '2.2';
  if(s==='held for the owner')return '2.3';
  if(s==='surveyed'||s==='to measure'||s==='landmark only')return '2.4';
  if(s==='found, to wire')return '3.1';
  if(s==='measured, not offered'||s==='wired, to measure')return '3.3';
  if(s==='surveyed, nothing usable'||!x.covRank)return '3.2';
  if(x.covRank<2)return '4.1';
  if(!x.streets)return '5.1';
  if(x.lines==null)return '6.1';
  if(r.checked!=='districts')return '7.1';
  return 'done';};
// The cities.json entries whose box holds a city's point (its own, or a neighbour's whose tiles reach it: Paris's
// petite couronne entry holds Saint-Mandé). ponytail: a box, not the boundary; a commune just outside a departements
// entry's departements but inside its box counts as held.
const entriesAt=(entries,c)=>c.lat==null?[]:(entries||[]).filter(e=>e.box&&c.lat>=e.box[0]&&c.lat<=e.box[2]&&c.lon>=e.box[1]&&c.lon<=e.box[3]);
if(typeof module!=='undefined'&&module.exports)module.exports={esc,fmt,pct,fold,near,holds,countsRows,wholeName,wholeByNumbers,LADDER,LADDER_RANK,ladderCode,entriesAt};
