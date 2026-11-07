"use client";
import { useEffect, useState } from "react";
import { photoStore, preparePhoto, type Photo } from "@/lib/photos";
export default function Album({close}:{close:()=>void}) {
 const [photos,setPhotos]=useState<Photo[]>([]),[error,setError]=useState(""),[busy,setBusy]=useState(false),[preview,setPreview]=useState<Blob|null>(null);
 const [urls,setUrls]=useState<string[]>([]),[previewUrl,setPreviewUrl]=useState("");
 useEffect(()=>{photoStore.list().then(setPhotos).catch(()=>setError("本地存储不可用，请检查浏览器设置。"));},[]);
 useEffect(()=>{const u=photos.map(p=>URL.createObjectURL(p.blob));setUrls(u);return()=>u.forEach(URL.revokeObjectURL);},[photos]);
 useEffect(()=>{const u=preview?URL.createObjectURL(preview):"";setPreviewUrl(u);return()=>{if(u)URL.revokeObjectURL(u);};},[preview]);
 async function save(){if(!preview)return;setBusy(true);try{await photoStore.save({id:crypto.randomUUID(),blob:preview,createdAt:Date.now()});setPhotos(await photoStore.list());setPreview(null);}catch{setError("保存失败，可能是本地空间不足。请重试。");}finally{setBusy(false);}}
 return <section className="album" aria-label="私人相册"><h2>我们的相册</h2><button onClick={close}>收起相册</button>
 <p>照片只保存在当前浏览器，不上传服务器。清除网站数据会丢失照片；同一浏览器的使用者可查看，请勿在公共设备保存私密照片。</p>
 <label>选择照片（JPEG / PNG / WebP，最多 8MB，最多 12 张）<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy||photos.length>=12} onChange={async e=>{const f=e.target.files?.[0];e.target.value="";if(!f)return;setBusy(true);setError("");setPreview(null);try{setPreview(await preparePhoto(f));}catch(err){setError(err instanceof Error?err.message:"图片无法读取");}finally{setBusy(false);}}}/></label>
 <p role="status">{busy?"正在处理…":error}</p>
 {previewUrl&&<div><img className="photo-preview" src={previewUrl} alt="待保存照片预览"/><button disabled={busy} onClick={save}>确认保存</button><button disabled={busy} onClick={()=>setPreview(null)}>取消</button></div>}
 {!photos.length&&<p>还没有照片，添加第一份回忆吧。</p>}
 <div className="photo-grid">{photos.map((p,i)=><figure key={p.id}><img src={urls[i]} alt={`相册照片 ${i+1}`}/><figcaption>回忆 {i+1} <button disabled={busy} onClick={async()=>{setBusy(true);try{await photoStore.remove(p.id);setPhotos(await photoStore.list());}catch{setError("删除失败，请重试。");}finally{setBusy(false);}}}>删除</button></figcaption></figure>)}</div></section>;
}
