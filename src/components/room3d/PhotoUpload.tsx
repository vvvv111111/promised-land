"use client";

import { useRef } from "react";

interface Props {
  id: string;
  label: string;
  describedBy: string;
  disabled?: boolean;
  hasPhoto: boolean;
  onSelect: (file: File) => void;
}

export default function PhotoUpload({ id, label, describedBy, disabled, hasPhoto, onSelect }: Props) {
  const input = useRef<HTMLInputElement>(null);
  return <>
    <input ref={input} id={id} hidden type="file" accept="image/jpeg,image/png,image/webp" disabled={disabled} onChange={event => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (file) onSelect(file);
    }} />
    <button type="button" className="room-agent-upload" disabled={disabled} aria-label={`${hasPhoto ? "更换" : "上传"}${label}`} aria-describedby={describedBy} onClick={() => input.current?.click()}>
      {hasPhoto ? "更换照片" : "上传照片"}
    </button>
  </>;
}
