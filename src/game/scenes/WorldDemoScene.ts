import * as Phaser from "phaser";
import room from "../room.json";
import { canPlace } from "../placement";

export class WorldDemoScene extends Phaser.Scene {
 constructor() { super("WorldDemo"); }
 preload() {
  this.load.image("room",room.background);
  room.assets.forEach(a=>this.load.image(a.id,a.path));
 }
 create() {
  const background=this.add.image(480,270,"room");
  background.setScale(Math.max(960/background.width,540/background.height));
  const camera=this.cameras.main;
  camera.setBounds(0,0,960,540);
  let startX=0,startY=0,scrollX=0,scrollY=0,moved=false,pinch=0;
  this.input.addPointer(1);
  const zoom=(value:number)=>camera.setZoom(Phaser.Math.Clamp(value,1,1.8));
  this.input.on("pointerdown",(p:Phaser.Input.Pointer)=>{startX=p.x;startY=p.y;scrollX=camera.scrollX;scrollY=camera.scrollY;moved=false;pinch=0;});
  this.input.on("pointermove",(p:Phaser.Input.Pointer)=>{
   const active=this.input.manager.pointers.filter(p=>p.isDown);
   if(active.length>=2){
    moved=true;const d=Phaser.Math.Distance.Between(active[0].x,active[0].y,active[1].x,active[1].y);
    if(pinch>0)zoom(camera.zoom*d/pinch);pinch=d;return;
   }
   pinch=0;if(!p.isDown)return;
   const dx=p.x-startX,dy=p.y-startY;if(Math.hypot(dx,dy)>6)moved=true;
   if(moved)camera.setScroll(scrollX-dx/camera.zoom,scrollY-dy/camera.zoom);
  });
  this.input.on("wheel",(_p:Phaser.Input.Pointer,_o:unknown,_dx:number,dy:number)=>zoom(camera.zoom-dy*.001));
  const select=(id:string)=>window.dispatchEvent(new CustomEvent("room-select",{detail:id}));
  const overlay=this.add.graphics().setDepth(1000).setVisible(false);
  room.surfaces.forEach(s=>{overlay.lineStyle(2,0x78d9b5,1);overlay.strokePoints(s.polygon.map(([x,y])=>new Phaser.Geom.Point(x,y)),true);});
  room.fixtures.forEach(f=>{
   const zone=this.add.zone(f.x,f.y,f.width,f.height).setDepth(1).setInteractive({useHandCursor:true});
   zone.on("pointerup",()=>{if(!moved)select(f.id);});
  });
  room.objects.forEach(o=>{
   const a=room.assets.find(a=>a.id===o.asset)!;
   if(!canPlace(o.asset,o.surface,o.x,o.y,o.width)) throw new Error(`Invalid placement: ${o.id}`);
   const [left,,right,bottom]=a.bounds;
   const s=this.add.image(o.x,o.y,a.id).setOrigin((left+right)/2/1536,bottom/1024).setScale(o.width/(right-left),o.width/(right-left)*o.scaleY);
   s.setDepth(room.surfaces.find(s=>s.id===o.surface)!.depth+o.y/1000);
   s.setInteractive(this.input.makePixelPerfect(128));
   s.on("pointerup",()=>{if(!moved)select(o.id);});
   s.on("pointerover",()=>s.setTint(0xffefd2));s.on("pointerout",()=>s.clearTint());
  });
  // Separate, lightweight ambient layer; no new objects allocated during update.
  const dust=this.add.container(0,0).setDepth(800);
  for(let i=0;i<18;i++){
   const x=100+(i*97)%650,y=120+(i*71)%340;
   const dot=this.add.circle(x,y,.7+(i%3)*.25,0xffedbf,.16+(i%4)*.04);dust.add(dot);
   this.tweens.add({targets:dot,x:x+18,y:y-24,duration:6500+i*237,yoyo:true,repeat:-1,ease:"Sine.easeInOut"});
  }
  const atmosphere=(enabled:boolean)=>{dust.setVisible(enabled);if(enabled)this.tweens.resumeAll();else this.tweens.pauseAll();};
  atmosphere(!window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const toggle=(e:Event)=>overlay.setVisible((e as CustomEvent<boolean>).detail);
  const view=(e:Event)=>{const action=(e as CustomEvent<string>).detail;if(action==="reset"){zoom(1);camera.centerOn(480,270);}else zoom(camera.zoom+(action==="in"?.15:-.15));};
  const ambient=(e:Event)=>atmosphere((e as CustomEvent<boolean>).detail);
  window.addEventListener("room-calibration",toggle);window.addEventListener("room-camera",view);window.addEventListener("room-atmosphere",ambient);
  this.events.once("shutdown",()=>{window.removeEventListener("room-calibration",toggle);window.removeEventListener("room-camera",view);window.removeEventListener("room-atmosphere",ambient);});
 }
}
