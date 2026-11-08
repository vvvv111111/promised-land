// Deterministic, deferred API responses test ordering and cancellation; no MiMo calls.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { confirmPreview } = require('./room-editor-browser-helpers.cjs');
const { roomFromDesign } = require('../.room-qa/pet-state/room/agent/design.js');
const { flexibleBedroomDesign } = require('../.room-qa/pet-state/room/agent/examples.js');
const { validateRoomDefinition } = require('../.room-qa/pet-state/room/definition.js');
const base = process.env.ROOM_URL || 'http://localhost:3225';
const key = 'promised-land:room-agent:v1';
const roomResult = {...roomFromDesign(flexibleBedroomDesign()),run:{id:'concurrent-room',model:'fixture',attempts:1,durationMs:10,totalTokens:1}};
const petResult = {species:'cat',template:'concurrent-cat',appearanceChanged:false,mappingLosses:['Fixture approximation'],glb:fs.readFileSync('.pet-library/outputs/Pet_Model_Selection_Room/cat.glb').toString('base64')};
function deferred() { let resolve; const promise=new Promise(r=>resolve=r);return {promise,resolve}; }
const saved = page => page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);
const pet = value => value?.definition.nodes.find(n=>n.petAsset);

async function scenario(browser,{order='room-first',first='room',cancel,fail,mobile=false,remove=false}={}) {
  const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:1000},reducedMotion:'reduce'});
  const roomGate=deferred(),petGate=deferred(),roomStarted=deferred(),petStarted=deferred();
  let petDeletes=0;
  try {
    await context.route('**/api/room-agent*',async route=>{
      if(route.request().method()==='GET') return route.fulfill({json:{configured:true}});
      if(route.request().method()==='DELETE') return route.fulfill({json:{status:'cancelled'}});
      roomStarted.resolve();await roomGate.promise;
      return route.fulfill(fail==='room'?{status:500,json:{error:{message:'Room fixture failed'}}}:{json:roomResult});
    });
    await context.route('**/api/pet-agent*',async route=>{
      const request=route.request();
      if(request.method()==='DELETE') {petDeletes++;return route.fulfill({json:{status:'cancelled'}});}
      if(request.method()==='POST') return route.fulfill({status:202,json:{id:'concurrent-pet',status:'running'}});
      if(!request.url().includes('?id=')) return route.fulfill({json:{configured:true,libraryAvailable:true,primaryAvailable:false}});
      petStarted.resolve();await petGate.promise;
      return route.fulfill({json:fail==='pet'?{id:'concurrent-pet',status:'failed',error:'Pet fixture failed'}:{id:'concurrent-pet',status:'succeeded',result:petResult}});
    });
    const page=await context.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(30_000);
    await page.goto(base+'/room-3d');
    await page.waitForFunction(()=>document.querySelector('.room3d-actions button')?.disabled===false);
    const tabs=name=>page.getByRole('tab',{name,exact:true});
    await tabs('宠物').click();
    await page.locator('#pet-agent-photo').setInputFiles('public/assets/warm-room-v1/cat_orange_01.png');
    await page.getByRole('button',{name:'生成宠物',exact:true}).waitFor({state:'visible'});
    await page.waitForFunction(()=>document.querySelector('.pet-agent .room-agent-primary')?.disabled===false);
    async function startRoom() {await tabs('房间').click();await page.locator('textarea').fill('Concurrent fixture bedroom');await page.getByRole('button',{name:'生成房间',exact:true}).click();await roomStarted.promise;}
    async function startPet() {await tabs('宠物').click();await page.getByRole('button',{name:'生成宠物',exact:true}).click();await petStarted.promise;}
    if(first==='room') {await startRoom();await startPet();} else {await startPet();await startRoom();}
    await page.getByText('房间与宠物生成中…',{exact:true}).waitFor();
    assert.equal(await saved(page),null,'Both tasks are previews until saved');
    assert.equal(await tabs('房间').isEnabled(),true);assert.equal(await tabs('宠物').isEnabled(),true);
    if(cancel==='room') {
      await tabs('房间').click();await page.getByRole('button',{name:'取消生成',exact:true}).click();
      await page.getByRole('alert').filter({hasText:'已取消'}).waitFor();
      assert.equal(petDeletes,0,'Cancelling the room must not cancel the pet');
      roomGate.resolve();petGate.resolve();
    } else if(cancel==='pet') {
      await tabs('宠物').click();await page.getByRole('button',{name:'取消处理',exact:true}).click();
      await page.getByRole('alert').filter({hasText:'已取消'}).waitFor();
      await page.waitForFunction(()=>document.querySelector('.pet-agent')?.getAttribute('aria-busy')==='false');
      assert.equal(petDeletes,1);petGate.resolve();roomGate.resolve();
    } else if(order==='pet-first') {
      petGate.resolve();await page.waitForFunction(()=>document.querySelector('.pet-agent')?.getAttribute('aria-busy')==='false');
      if(await page.getByRole('button',{name:'保存',exact:true}).count()) assert.equal(await page.getByRole('button',{name:'保存',exact:true}).isDisabled(),true);
      if(remove) {
        await tabs('宠物').click();await page.getByRole('button',{name:'移除宠物',exact:true}).click();
        await page.waitForFunction(()=>document.querySelector('.pet-agent')?.getAttribute('aria-busy')==='false');
      }
      roomGate.resolve();
    } else {
      roomGate.resolve();await page.waitForFunction(()=>document.querySelector('#room-editor-panel-room form')?.getAttribute('aria-busy')==='false');
      if(await page.getByRole('button',{name:'保存',exact:true}).count()) assert.equal(await page.getByRole('button',{name:'保存',exact:true}).isDisabled(),true);
      petGate.resolve();
    }
    await page.waitForFunction(()=>document.querySelector('.room-editor-savebar button')?.disabled===false);
    if(fail==='room') await page.getByRole('alert').filter({hasText:'Room fixture failed'}).waitFor();
    if(fail==='pet') {await tabs('宠物').click();await page.getByRole('alert').filter({hasText:'Pet fixture failed'}).waitFor();}
    await confirmPreview(page);
    const value=await saved(page);validateRoomDefinition(value.definition);
    if(cancel==='room'||fail==='room') assert.equal(value.run,undefined);else assert.equal(value.run.id,'concurrent-room');
    if(cancel==='pet'||fail==='pet'||remove) assert.equal(pet(value),undefined);else {assert.equal(pet(value).petAsset.template,'concurrent-cat');assert.equal(pet(value).petAsset.targetLength,.55);}
    if(mobile) {
      await tabs('宠物').scrollIntoViewIfNeeded();
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      await page.screenshot({path:'.room-qa/room-pet-concurrent-mobile.png'});
    } else if(!cancel&&!fail&&!remove) await page.screenshot({path:'.room-qa/room-pet-concurrent-desktop.png'});
    await page.reload();await page.waitForFunction(()=>document.querySelector('.room3d-actions button')?.disabled===false);
    assert.deepEqual(await saved(page),value,'Combined snapshot survives reload');assert.deepEqual(errors,[]);
  } finally {roomGate.resolve();petGate.resolve();await context.close();}
}

(async()=>{
  fs.mkdirSync('.room-qa',{recursive:true});
  const browser=await chromium.launch({headless:true,executablePath:process.env.ROOM_CHROMIUM||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  try {
    await scenario(browser,{order:'room-first',first:'room'});
    await scenario(browser,{order:'pet-first',first:'pet',mobile:true});
    await scenario(browser,{cancel:'room'});await scenario(browser,{cancel:'pet'});
    await scenario(browser,{fail:'room'});await scenario(browser,{fail:'pet',order:'pet-first'});
    await scenario(browser,{order:'pet-first',remove:true});
    console.log('PASS: independent starts, both completion orders, independent cancellation/failures, latest pet removal, save lock, combined persistence and desktop/mobile');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
