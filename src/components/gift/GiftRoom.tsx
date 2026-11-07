"use client";

import { useRef, useState } from "react";
import RoomAgentWorkbench from "@/components/room3d/RoomAgentWorkbench";
import type { RoomPreviewHandle } from "@/components/room3d/RoomPreview";
import { giftMemories } from "@/world/WinterGift";
import Icon from "./GiftIcon";

export default function GiftRoom({ recipient, giftId, collected, onCollect, onSaveStateChange, onAudioPlaying, backgroundPlaying }: {
  recipient: boolean; giftId: string; collected: string[]; onCollect: (id: string) => void;
  onSaveStateChange: (saved: boolean) => void; onAudioPlaying: (playing: boolean) => void; backgroundPlaying: boolean;
}) {
  const room = useRef<RoomPreviewHandle>(null);
  const [ready, setReady] = useState(false);
  return <>
    {!recipient && <div className="winter-edit-tools">
      <button disabled={!ready} className="winter-secondary" onClick={() => room.current?.onEditRequest("sunset-frame")}>编辑相框</button>
      <button disabled={!ready} className="winter-secondary" onClick={() => room.current?.onEditRequest("sealed-letter")}>编辑信件</button>
      <button disabled={!ready} className="winter-secondary" onClick={() => room.current?.onEditRequest("cd-player")}>CD 机</button>
    </div>}
    <div className="winter-room winter-room-3d"><RoomAgentWorkbench key={`${giftId}:${recipient}`} onSaveStateChange={onSaveStateChange} previewProps={{
      ref: room, giftId, mode: recipient ? "recipient" : "sender", onReady: () => setReady(true), onError: () => setReady(false),
      onItemCollected: onCollect, onAudioPlaying, backgroundPlaying,
    }} /></div>
    {recipient && <section className="winter-collection" aria-label="纪念物品收集进度"><div className="winter-keepsakes">
      {giftMemories.map((m, i) => <div key={m.object_id} className={collected.includes(m.object_id) ? "found" : ""}><span>{collected.includes(m.object_id) ? <Icon name="check" size={17} /> : i + 1}</span>{m.title}</div>)}
    </div><p role="status">已查看 {collected.length} / 3</p></section>}
  </>;
}
