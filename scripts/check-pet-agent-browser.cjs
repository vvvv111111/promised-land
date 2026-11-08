const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { confirmPreview } = require('./room-editor-browser-helpers.cjs');
const { roomFromDesign } = require('../.room-qa/pet-state/room/agent/design.js');
const { flexibleBedroomDesign } = require('../.room-qa/pet-state/room/agent/examples.js');
const base = process.env.ROOM_URL || 'http://localhost:3212';
const storageKey = 'promised-land:room-agent:v1';
const fixture = { ...roomFromDesign(flexibleBedroomDesign()), run:{id:'pet-room-fixture',model:'test-model',attempts:1,durationMs:10,totalTokens:1} };
const saved = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)),storageKey);
const pet = value => value.definition.nodes.find(n => n.petAsset);

(async () => {
  fs.mkdirSync('.room-qa',{recursive:true});
  const browser = await chromium.launch({headless:true,executablePath:process.env.ROOM_CHROMIUM || 'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  try {
    const context = await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce',acceptDownloads:true});
    await context.route('**/api/room-agent',route => route.request().method()==='POST' ? route.fulfill({json:fixture}) : route.continue());
    let photoModel='cat';
    await context.route('**/api/pet-agent',route=>{
      if(route.request().method()==='GET') return route.fulfill({json:{configured:true,primaryAvailable:true}});
      const body=route.request().postDataJSON();
      assert.deepEqual(Object.keys(body),['image']);assert.ok(body.image.startsWith('data:image/jpeg;base64,'));
      return route.fulfill({json:{status:'succeeded',result:{species:photoModel==='cat'||photoModel==='kitten'?'cat':'dog',template:photoModel,appearanceChanged:false,glb:fs.readFileSync(`.pet-library/outputs/Pet_Model_Selection_Room/${photoModel}.glb`).toString('base64')}}});
    });
    const page = await context.newPage(), errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    page.setDefaultTimeout(60_000);
    await page.goto(base+'/room-3d');
    await page.waitForFunction(()=>document.querySelector('.room3d-actions button')?.disabled===false);
    await page.getByRole('tab',{name:'宠物',exact:true}).click();
    assert.equal(await page.getByRole('button',{name:/选模型|用照片|预览模型/}).count(),0);
    assert.equal(await page.locator('#pet-agent-template').count(),0);
    assert.equal(await page.locator('#pet-agent-photo').isVisible(),false,'The native empty-file message is hidden');
    assert.equal(await page.getByRole('button',{name:'上传宠物照片',exact:true}).isVisible(),true);
    await page.getByText('宠物照片（选填）',{exact:true}).waitFor();
    await page.locator('#pet-agent-photo').setInputFiles('public/assets/warm-room-v1/cat_orange_01.png');
    for(const id of ['cat','kitten','dog','puppy']) {
      const before = await saved(page);
      photoModel=id;
      await page.getByRole('button',{name:'生成宠物',exact:true}).click();
      await page.waitForFunction(()=>document.querySelector('.room-editor-savebar button')?.disabled===false);
      assert.deepEqual(await saved(page),before,'Preview must not write the committed room');
      assert.equal(await page.locator('#pet-agent-length, #pet-agent-yaw').count(),0,'Pet dimensions and rotation are automatic');
      await confirmPreview(page);
      const value=await saved(page), model=pet(value);
      assert.equal(model.petAsset.template,id); assert.equal(model.petAsset.targetLength,.55);
      assert.equal(model.petAsset.glb,''); assert.match(model.petAsset.assetId,/^[a-f0-9]{64}$/);
      assert.ok(JSON.stringify(value).length<100_000,'Binary models must not fill localStorage');
      await page.locator('.room3d-stage').screenshot({path:`.room-qa/pet-${id}.png`});
    }
    const original=pet(await saved(page));
    await page.reload();
    await page.waitForFunction(()=>document.querySelector('.room3d-actions button')?.disabled===false);
    assert.deepEqual(pet(await saved(page)),original,'Reload preserves the exact selected asset and transform');
    await page.getByRole('tab',{name:'宠物',exact:true}).click();
    await page.getByRole('tab',{name:'房间',exact:true}).click();
    const beforeRoom = await saved(page);
    await page.locator('textarea').fill('fixture bedroom');
    await page.getByRole('button',{name:'生成房间',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('.room-editor-savebar button')?.disabled===false);
    assert.deepEqual(await saved(page),beforeRoom);
    await page.getByRole('button',{name:'撤销',exact:true}).click();
    assert.deepEqual(await saved(page),beforeRoom,'Discard retains the committed snapshot');
    await page.getByRole('button',{name:'生成房间',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('.room-editor-savebar button')?.disabled===false);
    await page.getByRole('tab',{name:'宠物',exact:true}).click();
    assert.equal(await page.locator('#pet-agent-length, #pet-agent-yaw').count(),0);
    await confirmPreview(page);
    assert.equal(pet(await saved(page)).petAsset.template,'puppy');
    assert.equal(pet(await saved(page)).petAsset.targetLength,.55);
    await page.waitForFunction(()=>document.querySelector('.room3d-actions button')?.disabled===false);
    // The recipient renders the saved room and its locally persisted pet model.
    const imported=await context.newPage(); await imported.goto(base+'/room-3d?mode=recipient');
    await imported.waitForFunction(()=>document.querySelector('.room3d-actions button')?.disabled===false);
    assert.equal(await imported.locator('#pet-agent-photo').count(),0,'Recipient has no pet editing controls');
    await imported.close();
    // A storage failure must keep the previously committed room intact.
    const committed=await saved(page);
    photoModel='cat';
    await page.locator('#pet-agent-photo').setInputFiles('public/assets/warm-room-v1/cat_orange_01.png');
    await page.getByRole('button',{name:'生成宠物',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('.room-editor-savebar button')?.disabled===false);
    await page.evaluate(()=>{window.petOriginalSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key==='promised-land:room-agent:v1')throw new DOMException('full','QuotaExceededError');return window.petOriginalSetItem.call(this,key,value)}});
    await page.getByRole('button',{name:'保存',exact:true}).click();
    await page.getByText('保存失败，请重试。',{exact:true}).waitFor();
    assert.deepEqual(await saved(page),committed);
    await page.evaluate(()=>{Storage.prototype.setItem=window.petOriginalSetItem});
    await confirmPreview(page);
    assert.equal(pet(await saved(page)).petAsset.template,'cat');
    // Mock only the recognition response: this checks metadata transport, not coat rendering.
    const appearance = {pet:'cat',color:'white',accent:'brown',pattern:'bicolor_white',scale:1,amount:.5,seed:0};
    const metadata = {appearanceChanged:true,appearance,regionalPreset:'BicolorWhite',mappingLosses:['Fixture approximation'],photoCoat:{version:1,base:'#f4f1e8',regions:{head:'#704820',chest:'#f4f1e8'},markings:[]}};
    let photoRequests=0;
    await context.route('**/api/pet-agent',async route=>{
      const request=route.request();
      if(request.method()==='GET') return route.fulfill({json:{configured:true,libraryAvailable:true,primaryAvailable:true,regionalPresets:['bicolor_white']}});
      if(request.method()==='POST' && request.postDataJSON().image) {
        photoRequests++;
        return route.fulfill({json:{status:'succeeded',result:{species:'cat',template:'original_cat',glb:fs.readFileSync('.pet-library/outputs/Pet_Model_Selection_Room/cat.glb').toString('base64'),...metadata}}});
      }
      return route.continue();
    });
    await page.reload();
    await page.waitForFunction(()=>document.querySelector('.room3d-actions button')?.disabled===false);
    await page.getByRole('tab',{name:'宠物',exact:true}).click();
    await page.locator('#pet-agent-photo').setInputFiles('public/assets/warm-room-v1/cat_orange_01.png');
    await page.getByRole('button',{name:'生成宠物',exact:true}).click();
    await confirmPreview(page);
    assert.equal(photoRequests,1);
    for(const [key,value] of Object.entries(metadata)) assert.deepEqual(pet(await saved(page)).petAsset[key],value);
    await page.reload();
    await page.waitForFunction(()=>document.querySelector('.room3d-actions button')?.disabled===false);
    for(const [key,value] of Object.entries(metadata)) assert.deepEqual(pet(await saved(page)).petAsset[key],value);
    assert.equal(pet(await saved(page)).petAsset.glb,'');
    await page.getByRole('tab',{name:'宠物',exact:true}).scrollIntoViewIfNeeded();
    await page.getByRole('tab',{name:'宠物',exact:true}).click();
    await page.screenshot({path:'.room-qa/pet-desktop.png'});
    await page.setViewportSize({width:390,height:844});
    await page.getByRole('tab',{name:'宠物',exact:true}).scrollIntoViewIfNeeded();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await page.locator('.pet-agent').screenshot({path:'.room-qa/pet-mobile-controls.png'});
    assert.ok(await page.locator('.room3d-stage').isVisible());
    await page.screenshot({path:'.room-qa/pet-mobile-room.png'});
    await page.getByRole('button',{name:'移除宠物',exact:true}).click();
    assert.ok(pet(await saved(page)),'Removal is also a preview until confirmed');
    await confirmPreview(page);
    assert.equal(pet(await saved(page)),undefined);
    await page.reload(); await page.waitForFunction(()=>document.querySelector('.room3d-actions button')?.disabled===false);
    assert.equal(pet(await saved(page)),undefined);
    assert.deepEqual(errors,[]);
    console.log('PASS: optional photo upload, hidden native file input, automatic pet dimensions/rotation, four real GLB fixtures, persistence, room regeneration, recipient rendering, quota rollback/retry, desktop/mobile and removal');
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1});
