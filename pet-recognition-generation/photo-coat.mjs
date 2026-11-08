// Calibrated anatomical masks for the approved +Z-facing FBX cat/dog templates.
// All provider inputs remain bounded data; no images, URLs or executable expressions.
export const regionNames = ['head','back','leftFlank','rightFlank','chest','belly','leftFace','rightFace','muzzle','leftEar','rightEar','frontLegs','hindLegs','paws','tail','tailTip','blaze'];
const hex = c => typeof c === 'string' && /^#[a-f\d]{6}$/i.test(c);
const keys = (v, list) => v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).sort().join() === [...list].sort().join();
export function validatePhotoCoat(c) {
  if (!keys(c,['version','base','regions','markings']) || c.version !== 1 || !hex(c.base) || !c.regions || typeof c.regions !== 'object' || Array.isArray(c.regions) || Object.entries(c.regions).some(([r,v])=>!regionNames.includes(r)||!hex(v)) || !Array.isArray(c.markings) || c.markings.length > 12) throw Error('照片毛色分区无效');
  for (const m of c.markings) {
    if (!keys(m,['region','kind','color','center','size','coverage']) || !regionNames.includes(m.region) || !['patch','stripes','spots'].includes(m.kind) || !hex(m.color) || !Number.isFinite(m.coverage) || m.coverage < .05 || m.coverage > .95) throw Error('照片花纹无效');
    for (const [key,low] of [['center',0],['size',.03]]) if (!Array.isArray(m[key]) || m[key].length !== 2 || m[key].some(n=>!Number.isFinite(n)||n<low||n>1)) throw Error('照片花纹位置无效');
  }
  return c;
}
const rgb = c => [1,3,5].map(i=>parseInt(c.slice(i,i+2),16));
const clamp = v => Math.min(1,Math.max(0,v));
function smooth(a,b,v) { const t=clamp((v-a)/(b-a));return t*t*(3-2*t); }
function blend(out,color,w) { w=clamp(w);for(let i=0;i<3;i++)out[i]+=(color[i]-out[i])*w; }
function hash(x,y) {let n=Math.imul(x+73,374761393)^Math.imul(y+129,668265263);n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967295;}

export function createCoatContext(coat,pet) {
  validatePhotoCoat(coat);
  if(!['cat','dog'].includes(pet))throw Error('照片毛色物种无效');
  const order=['head','leftFlank','rightFlank','back','chest','belly','leftFace','rightFace','muzzle','leftEar','rightEar','frontLegs','hindLegs','paws','tail','tailTip','blaze'];
  return {pet,base:rgb(coat.base),hasPaws:!!coat.regions.paws,regions:order.filter(r=>coat.regions[r]).map(r=>({index:regionNames.indexOf(r),color:rgb(coat.regions[r])})),markings:coat.markings.map((m,i)=>({...m,index:regionNames.indexOf(m.region),rgb:rgb(m.color),seed:i})),weights:new Float32Array(regionNames.length)};
}

export function sampleCoatRegions(x,y,z,head,ear,tail,leg,out,pet='cat') {
  const h=smooth(.25,.75,head),e=smooth(.3,.8,ear),t=smooth(.2,.8,tail),l=smooth(.25,.7,leg);
  const body=(1-h)*(1-e)*(1-t)*(1-l),left=smooth(.47,.53,x),face=h*(1-e);
  out[0]=face;out[1]=body*smooth(.29,.42,y);
  out[2]=body*left;out[3]=body*(1-left);
  out[4]=Math.max(body*smooth(.60,.74,z)*(1-smooth(.45,.54,y)),face*(1-smooth(.52,.61,y))*(1-smooth(.88,.94,z)));
  out[5]=body*(1-smooth(.29,.38,y));
  out[6]=face*left;out[7]=face*(1-left);
  out[8]=face*smooth(.86,.94,z)*(1-smooth(.8,1.05,Math.hypot((x-.5)/(pet==='cat'?.16:.20),(y-(pet==='cat'?.54:.58))/.13)));
  out[9]=e*left;out[10]=e*(1-left);
  out[11]=l*smooth(.48,.60,z);out[12]=l*(1-smooth(.48,.60,z));
  out[13]=l*(1-smooth(.035,.085,y));out[14]=t;
  out[15]=t*(1-smooth(.045,.10,z));
  out[16]=face*(1-smooth(.035,.075,Math.abs(x-.5)))*smooth(.79,.88,z)*smooth(.55,.65,y);
  return out;
}

function coordinates(index,x,y,z) {
  if([0,6,7,8,9,10,16].includes(index))return [(x-.12)/.76,(y-.48)/.45];
  if([11,12,13].includes(index))return [(x-.1)/.8,y/.4];
  if([14,15].includes(index))return [(.32-z)/.32,(y-.25)/.4];
  return [(z-.28)/.5,(y-.25)/.32];
}

export function paintPhotoCoat(x,y,z,head,ear,tail,leg,detail,front,ctx,out) {
  if(detail?.kind==='eye') {
    const dx=(x-(detail.min[0]+detail.max[0])*.5)/(detail.max[0]-detail.min[0])*2,dy=(y-(detail.min[1]+detail.max[1])*.5)/(detail.max[1]-detail.min[1])*2;
    const forward=smooth(.4,.75,(z-detail.min[2])/(detail.max[2]-detail.min[2])),iris=(1-smooth(.65,.9,Math.hypot(dx,dy)))*forward;
    out[0]=30+iris*20;out[1]=24+iris*12;out[2]=19+iris*5;
    blend(out,[247,245,229],(1-smooth(.13,.22,Math.hypot(dx+.26,dy-.32)))*forward);return out;
  }
  if(detail?.kind==='whisker'){out[0]=217;out[1]=205;out[2]=180;return out;}
  for(let i=0;i<3;i++)out[i]=ctx.base[i];
  const weights=sampleCoatRegions(x,y,z,head,ear,tail,leg,ctx.weights,ctx.pet);
  for(const r of ctx.regions)blend(out,r.color,weights[r.index]);
  for(const m of ctx.markings) {
    if(weights[m.index]<.002)continue;
    const [u,v]=coordinates(m.index,x,y,z),du=(u-m.center[0])/m.size[0],dv=(v-m.center[1])/m.size[1];
    const envelope=1-smooth(.92,1.05,Math.hypot(du,dv));
    let ink=envelope;
    if(m.kind==='stripes' && [0,6,7,8,16].includes(m.index)) {
      const stroke=(v,c,w)=>1-smooth(w,w+.012,Math.abs(v-c)),side=Math.abs(x-.5);
      const cheek=Math.max(stroke(y,.65-side*.11,.009),stroke(y,.705-side*.15,.007))*smooth(.17,.23,side)*(1-smooth(.34,.41,side))*smooth(.79,.86,z);
      const forehead=Math.max(stroke(x,.5+.005*Math.sin((y-.76)*58),.008),stroke(side,.052+.018*Math.sin((y-.78)*24),.006))*smooth(.755,.78,y)*(1-smooth(.855,.895,y))*smooth(.75,.82,z);
      ink*=Math.max(cheek,forehead);
    } else if(m.kind==='stripes') {
      // Body ribs wrap down the flanks; limb/tail rings and face stripes use their local axis.
      const axis=[11,12,13,14,15].includes(m.index)?v:u;
      const phase=axis*11+.14*Math.sin(v*17+u*5),f=phase-Math.floor(phase);
      ink*=1-smooth(.10+m.coverage*.16,.14+m.coverage*.16,Math.abs(f-.5));
    } else if(m.kind==='spots') {
      const frequency=9,cx=Math.floor(u*frequency),cy=Math.floor(v*frequency);
      const dx=u*frequency-cx-(.2+.6*hash(cx+m.seed,cy)),dy=v*frequency-cy-(.2+.6*hash(cx,cy+19+m.seed));
      const radius=(.14+.28*m.coverage)*(.65+.7*hash(cx+31,cy+53));
      ink*=1-smooth(radius,radius+.07,Math.hypot(dx*(.8+.4*hash(cx,cy+3)),dy));
    }
    const pawProtection=ctx.hasPaws&&[11,12].includes(m.index)?1-weights[13]:1;
    blend(out,m.rgb,ink*weights[m.index]*pawProtection);
  }
  // Preserve eyes, whiskers and nose; do not invent a pale muzzle/belly on dark pets.
  const cat=ctx.pet==='cat',h=smooth(.25,.75,head),e=smooth(.3,.8,ear);
  if(cat)blend(out,[194,132,120],e*smooth(.79,.87,y)*(1-smooth(.95,.99,y))*smooth(.2,.6,front)*.65);
  const noseY=cat?.568:.609,noseWidth=cat?.039:.066,noseHeight=cat?.018:.027;
  blend(out,cat?[105,66,60]:[38,31,28],(1-smooth(.8,1.05,Math.hypot((x-.5)/noseWidth,(y-noseY)/noseHeight)))*smooth(.975,.992,z)*h);
  return out;
}
