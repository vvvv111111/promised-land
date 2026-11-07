// Local-only adapter. A remote adapter must enforce authentication and album ownership.
export type Photo = { id: string; blob: Blob; createdAt: number };
export interface PhotoStore { list(): Promise<Photo[]>; save(photo: Photo): Promise<void>; remove(id: string): Promise<void> }
function open(): Promise<IDBDatabase> { return new Promise((resolve,reject)=>{
 const r=indexedDB.open("promised-land-private-album",1);
 r.onupgradeneeded=()=>r.result.createObjectStore("photos",{keyPath:"id"});
 r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);
}); }
async function operation<T>(mode: IDBTransactionMode, action:(s:IDBObjectStore)=>IDBRequest<T>):Promise<T> {
 const db=await open();return new Promise((resolve,reject)=>{
 const tx=db.transaction("photos",mode), r=action(tx.objectStore("photos"));
 tx.oncomplete=()=>{db.close();resolve(r.result);};
 tx.onabort=()=>{db.close();reject(tx.error ?? new Error("保存失败"));};
 tx.onerror=()=>{db.close();reject(tx.error);};
 });
}
export const photoStore: PhotoStore={
 list:()=>operation("readonly",s=>s.getAll()),
 save:async p=>{await operation("readwrite",s=>s.put(p));},
 remove:async id=>{await operation("readwrite",s=>s.delete(id));}
};
export async function preparePhoto(file: File): Promise<Blob> {
 if(file.size>8*1024*1024 || !["image/jpeg","image/png","image/webp"].includes(file.type)) throw new Error("请选择 8MB 以内的 JPEG、PNG 或 WebP 图片。");
 const bytes=new Uint8Array(await file.slice(0,12).arrayBuffer());
 const jpeg=bytes[0]===255 && bytes[1]===216 && bytes[2]===255;
 const png=[137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v);
 const webp=String.fromCharCode(...bytes.slice(0,4))==="RIFF" && String.fromCharCode(...bytes.slice(8,12))==="WEBP";
 if(!(file.type==="image/jpeg" && jpeg || file.type==="image/png" && png || file.type==="image/webp" && webp)) throw new Error("图片内容与文件类型不一致。");
 const bitmap=await createImageBitmap(file);
 try {
 if(bitmap.width*bitmap.height>24000000) throw new Error("图片过大，请选择 2400 万像素以内的图片。");
 const scale=Math.min(1,1600/Math.max(bitmap.width,bitmap.height));
 const canvas=document.createElement("canvas");canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
 const ctx=canvas.getContext("2d");if(!ctx) throw new Error("无法处理图片");
 ctx.fillStyle="#fff";ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
 return await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error("图片处理失败")),"image/jpeg",0.88));
 } finally {bitmap.close();}
}
