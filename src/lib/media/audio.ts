export const MAX_AUDIO_BYTES = 20 * 1024 * 1024;
export type AudioSelection = { name: string; blob: Blob };

/** Inspect the container and let this browser verify decoding before replacing anything. */
export async function prepareRoomAudio(file: File): Promise<AudioSelection> {
  if (!file.size || file.size > MAX_AUDIO_BYTES) throw new Error("请选择 20MB 以内的音频文件。");
  if (file.type && !file.type.startsWith("audio/") && file.type !== "application/ogg") throw new Error("请选择音乐或录音文件。");
  const bytes = new Uint8Array(await file.slice(0, 64).arrayBuffer());
  const text = (start: number, end: number) => String.fromCharCode(...bytes.slice(start, end));
  let mime = "";
  if (text(0, 4) === "RIFF" && text(8, 12) === "WAVE") mime = "audio/wav";
  else if (text(0, 3) === "ID3" || bytes[0] === 255 && (bytes[1] & 224) === 224 && (bytes[1] & 6) !== 0) mime = "audio/mpeg";
  else if (text(4, 8) === "ftyp") mime = "audio/mp4";
  else if (text(0, 4) === "OggS") mime = "audio/ogg";
  else if ([26, 69, 223, 163].every((value, index) => bytes[index] === value)) mime = "audio/webm";
  else if (text(0, 4) === "fLaC") mime = "audio/flac";
  else if (bytes[0] === 255 && (bytes[1] & 246) === 240) mime = "audio/aac";
  if (!mime) throw new Error("无法识别音频内容，请选择有效的音乐或录音文件。");
  const blob = new Blob([file], { type: mime });
  const url = URL.createObjectURL(blob), audio = new Audio();
  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => finish(new Error("音频读取超时，请换一个文件后重试。")), 15000);
      function finish(error?: Error) {
        clearTimeout(timeout); audio.onloadeddata = audio.onerror = null;
        if (error) reject(error); else resolve();
      }
      audio.onloadeddata = () => finish();
      audio.onerror = () => finish(new Error("浏览器无法播放此音频，请尝试 MP3、WAV 或 M4A 文件。"));
      audio.preload = "auto"; audio.src = url; audio.load();
    });
    return { name: file.name.replace(/[\u0000-\u001f]/g, "").slice(0, 180) || "音频", blob };
  } finally { audio.pause(); audio.removeAttribute("src"); audio.load(); URL.revokeObjectURL(url); }
}
