const assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const path=require('node:path');
async function checkPhotoCoat() {
  const {createCoatContext,paintPhotoCoat,validatePhotoCoat}=await import(pathToFileURL(path.resolve('pet-recognition-generation/photo-coat.mjs')));
  const coat={version:1,base:'#151515',regions:{chest:'#f4f2ed',muzzle:'#f4f2ed',paws:'#f4f2ed'},markings:[]};
  const sample=(ctx,x,y,z,h=0,e=0,t=0,l=0,detail=null)=>paintPhotoCoat(x,y,z,h,e,t,l,detail,1,ctx,[0,0,0]);
  const ctx=createCoatContext(coat,'cat');
  assert.ok(sample(ctx,.7,.43,.47).every(n=>n<30),'Tuxedo torso stays black, without invented random patches');
  assert.ok(sample(ctx,.7,.25,.77).every(n=>n>225),'Observed white chest is placed at the front');
  assert.ok(sample(ctx,.3,.02,.65,0,0,0,1).every(n=>n>225),'White socks reach the paws');
  assert.ok(sample(ctx,.3,.3,.65,0,0,0,1).every(n=>n<30),'White paws do not whiten entire legs');
  const solid=createCoatContext({...coat,regions:{}},'cat');
  assert.ok(sample(solid,.7,.25,.47).every(n=>n<30),'Solid black pet does not acquire a pale belly');
  assert.ok(sample(solid,.5,.54,.95,1).every(n=>n<30),'Solid black pet does not acquire a pale muzzle');
  const mark={region:'leftFlank',kind:'patch',color:'#cc7722',center:[.4,.6],size:[.3,.3],coverage:.5};
  const patched=createCoatContext({...coat,regions:{},markings:[mark]},'cat');
  assert.ok(sample(patched,.8,.442,.48)[0]>150,'Photo patch covers its requested flank position');
  assert.ok(sample(patched,.2,.442,.48)[0]<30,'Photo patch does not jump to the opposite flank');
  const saddle=createCoatContext({version:1,base:'#ad7548',regions:{leftFlank:'#ffffff',rightFlank:'#ffffff',back:'#151515',chest:'#ffffff'},markings:[]},'dog');
  assert.ok(sample(saddle,.7,.48,.48)[0]<30,'White flanks cannot erase the black saddle');
  const eye={kind:'eye',min:[.2,.6,.88],max:[.3,.7,.93]};
  assert.deepEqual(sample(ctx,.26,.67,.925,1,0,0,0,eye),sample(patched,.26,.67,.925,1,0,0,0,eye),'Eyes are independent of coat observations');
  const pattern={...mark,region:'head',kind:'spots',center:[.5,.5],size:[1,1],coverage:.7,color:'#080808'};
  const spotted=createCoatContext({version:1,base:'#f0f0f0',regions:{},markings:[pattern]},'dog');
  let ink=0,white=0;
  for(let x=.2;x<.8;x+=.012)for(let y=.64;y<.82;y+=.012){const c=sample(spotted,x,y,.87,1);if(c[0]<80)ink++;if(c[0]>220)white++;}
  assert.ok(ink>20&&white>20,'Head spots preserve distinct dark marks and white background');
  for(const mutate of [v=>v.base='url(secret)',v=>v.regions.unknown='#ffffff',v=>v.markings=[{...mark,region:'url'}],v=>v.markings=[{...mark,size:[0,1]}],v=>v.markings=[{...mark,coverage:true}],v=>v.markings=Array(13).fill(mark)]) {
    const bad=structuredClone(coat);mutate(bad);assert.throws(()=>validatePhotoCoat(bad));
  }
  console.log('PASS: observed chest/paw placement, dark coat preservation, asymmetric patches, head spots, protected eyes and bounded coat data');
}
module.exports=checkPhotoCoat;
if(require.main===module)checkPhotoCoat().catch(e=>{console.error(e);process.exitCode=1});
