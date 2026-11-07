"use client";

import { useRef, useState } from "react";
import WorldDemo, { type WorldDemoHandle } from "@/components/world/WorldDemo";
import { demoWorld } from "@/world/config";
import Icon from "./GiftIcon";

export const memories = demoWorld.objects.filter(o => o.type === "memory");

export default function GiftRoom({ recipient, collected, onCollect }: { recipient: boolean; collected: string[]; onCollect: (id: string) => void }) {
  const roomRef = useRef<WorldDemoHandle>(null);
  const [ready, setReady] = useState(false);
  function activate(objectId: string) {
    roomRef.current?.onEditRequest(objectId);
  }
  return <>
    {!recipient && <div className="winter-edit-tools"><button disabled={!ready} className="winter-secondary" onClick={() => activate("sunset-frame")}>编辑相框</button><button disabled={!ready} className="winter-secondary" onClick={() => activate("sealed-letter")}>编辑信件</button></div>}
    <div className="winter-room"><WorldDemo ref={roomRef} onReady={() => setReady(true)} onError={() => setReady(false)} onItemCollected={id => { if (recipient) onCollect(id); }} /></div>
    {recipient && <section className="winter-collection" aria-label="纪念物品收集进度"><div className="winter-keepsakes">{memories.map((m, i) => <div key={m.object_id} className={collected.includes(m.object_id) ? "found" : ""}><span>{collected.includes(m.object_id) ? <Icon name="check" size={17} /> : i + 1}</span>{m.interaction.title}</div>)}</div><p role="status">已查看 {collected.length} / 3</p></section>}
  </>;
}
