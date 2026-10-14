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
if(typeof module!=='undefined'&&module.exports)module.exports={esc,fmt,pct,fold,near,holds,countsRows,wholeName,wholeByNumbers};
