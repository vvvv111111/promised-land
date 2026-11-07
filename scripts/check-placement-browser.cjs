const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const world = require('../src/world/demo-world.json');
const manifest = require('../src/world/asset-manifest.json');
const { RoomPlacement, insidePolygon, polygonsOverlap } = require('../.room-qa/placement-state/RoomPlacement.js');
const key = `promised-land:layout:${world.world_id}`;
const url = process.env.ROOM_URL || 'http://localhost:3000';
fs.mkdirSync('.room-qa',{recursive:true});
(async()=>{
  const browser=await chromium.launch({headless:true,...(process.env.ROOM_CHROMIUM?{executablePath:process.env.ROOM_CHROMIUM}:{})});
  try {
    const page=await browser.newPage({viewport:{width:1280,height:1100}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`${url}/world-demo`);
    const ready=()=>page.locator('.canvas-status').filter({hasText:'房间已就绪'}).waitFor({timeout:45000});
    await ready();
    const saved=()=>page.evaluate(k=>JSON.parse(localStorage.getItem(k)||'{}'),key);
    const model=async()=>{
      const entries=await saved();
      const m=new RoomPlacement(world,manifest,Object.fromEntries(Object.entries(entries).map(([id,e])=>[id,e.position])));
      for(const [id,e]of Object.entries(entries)){
        const pose=m.pose(id);
        assert.ok(Math.hypot(pose.anchor.x-e.position.x,pose.anchor.y-e.position.y)<1e-6,'Saved position must already be physically valid');
      }
      for(const o of world.objects){
        const pose=m.pose(o.object_id),foot=m.footprint(o.object_id);
        const surface=world.placement.surfaces.find(s=>s.surface_id===pose.surface_id);
        assert.ok(foot.every(p=>insidePolygon(p,surface.polygon)));
        for(const b of surface.blockers)assert.equal(polygonsOverlap(foot,b.polygon),false);
        for(const other of world.objects)if(other.object_id!==o.object_id&&m.pose(other.object_id).surface_id===pose.surface_id)assert.equal(polygonsOverlap(foot,m.footprint(other.object_id)),false);
      }
      return m;
    };
    const reset=()=>page.getByRole('button',{name:'恢复默认摆放',exact:true}).click();
    const drag=async(id,target)=>{
      const o=world.objects.find(o=>o.object_id===id),a=manifest.assets.find(a=>a.asset_id===o.asset_id);
      const origin=o.anchor||a.default_anchor;
      const from=(await model()).pose(id).anchor;
      const dx=(.5-origin.x)*o.size.width,dy=(.5-origin.y)*o.size.width;
      await page.locator('canvas').scrollIntoViewIfNeeded();const b=await page.locator('canvas').boundingBox();
      await page.mouse.move(b.x+b.width*(from.x+dx),b.y+b.height*(from.y+dy));await page.mouse.down();
      await page.mouse.move(b.x+b.width*(target.x+dx),b.y+b.height*(target.y+dy),{steps:20});await page.mouse.up();
      await page.waitForFunction(({key,id})=>!!JSON.parse(localStorage.getItem(key)||'{}')[id],{key,id});
      return model();
    };
    const click=async(x,y,title)=>{
      await page.locator('canvas').scrollIntoViewIfNeeded();const b=await page.locator('canvas').boundingBox();
      await page.mouse.click(b.x+b.width*x,b.y+b.height*y);
      await page.locator('.room-panel h2').filter({hasText:title}).waitFor();
    };
    await page.screenshot({path:'.room-qa/placement-default.png',fullPage:true});
    let m=await drag('sage-chair',{x:.35,y:.1});
    assert.ok(m.pose('sage-chair').ground.y>.44,'Chair cannot go onto wall');
    await reset();
    m=await drag('orange-cat',{x:.35,y:.6676});
    const cg=m.pose('sage-chair').ground,pg=m.pose('orange-cat').ground;
    assert.ok(Math.hypot(cg.x-pg.x,cg.y-pg.y)>.025,'Cannot intersect chair footprint');
    await reset();
    m=await drag('sage-chair',{x:.84,y:.44});assert.equal(m.pose('sage-chair').surface_id,'floor');
    await reset();
    m=await drag('seaside-shell',{x:.82,y:.4295});
    console.log('Browser tabletop:',JSON.stringify(m.pose('seaside-shell')));
    await page.screenshot({path:'.room-qa/placement-attempt.png',fullPage:true});
    assert.equal(m.pose('seaside-shell').surface_id,'side-table-top');
    let shell=m.pose('seaside-shell').anchor;
    await click(shell.x,shell.y,world.objects.find(o=>o.object_id==='seaside-shell').interaction.title);
    await page.screenshot({path:'.room-qa/placement-tabletop.png',fullPage:true});
    await page.reload();await ready();m=await model();assert.equal(m.pose('seaside-shell').surface_id,'side-table-top');
    shell=m.pose('seaside-shell').anchor;
    await page.setViewportSize({width:390,height:844});
    await click(shell.x,shell.y,world.objects.find(o=>o.object_id==='seaside-shell').interaction.title);
    await page.screenshot({path:'.room-qa/placement-mobile.png',fullPage:true});
    await page.setViewportSize({width:1280,height:1100});await reset();
    const before=await page.locator('canvas').screenshot();
    m=await drag('orange-cat',{x:.75,y:.60});
    const cat=m.pose('orange-cat');assert.ok(cat.depth<.615);
    await click(cat.anchor.x,cat.anchor.y-.085,world.objects.find(o=>o.object_id==='orange-cat').interaction.title);
    await click(.786,.54,world.hotspots.find(h=>h.hotspot_id==='side-table').interaction.title);
    const after=await page.locator('canvas').screenshot();
    const colors=await page.evaluate(async({before,after})=>{
      const pixel=async(data)=>{const img=new Image();img.src=data;await img.decode();const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const x=c.getContext('2d');x.drawImage(img,0,0);return [...x.getImageData(Math.floor(.786*img.width),Math.floor(.54*img.height),1,1).data];};
      return [await pixel(before),await pixel(after)];
    },{before:`data:image/png;base64,${before.toString('base64')}`,after:`data:image/png;base64,${after.toString('base64')}`});
    assert.deepEqual(colors[0],colors[1],'Foreground table leg must remain in front of the cat');
    await page.screenshot({path:'.room-qa/placement-occlusion.png',fullPage:true});
    assert.deepEqual(errors,[]);
    console.log('PASS: wall/floor bounds, object collisions, furniture support restrictions, tabletop snap, lamp avoidance, persisted placement, mobile alignment, foreground occlusion and hidden-pixel click filtering');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
