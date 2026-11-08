import { MAX_ROOM_REFERENCE_LENGTH, ROOM_REFERENCE_MAX_EDGE } from "../../room/agent/reference";

/** Accept only bounded inline JPEGs. Never fetch an arbitrary image URL server-side. */
export function validateRoomReference(input: unknown): asserts input is string {
  if (typeof input !== "string" || input.length > MAX_ROOM_REFERENCE_LENGTH || !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(input)) {
    throw new Error("参考照片格式无效，请通过上传入口选择 JPG、PNG 或 WebP 照片。");
  }
  const encoded = input.slice("data:image/jpeg;base64,".length);
  const bytes = Buffer.from(encoded, "base64");
  if (bytes.toString("base64") !== encoded || bytes.length < 12 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes.at(-2) !== 0xff || bytes.at(-1) !== 0xd9) throw new Error("参考照片无法读取，请重新选择。");
  let offset = 2;
  while (offset < bytes.length - 2) {
    if (bytes[offset++] !== 0xff) break;
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (marker === 0xda || marker === 0xd9) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.length) break;
    const length = bytes.readUInt16BE(offset);
    if (length < 2 || offset + length > bytes.length) break;
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      if (length < 8) break;
      const height = bytes.readUInt16BE(offset + 3), width = bytes.readUInt16BE(offset + 5);
      if (width < 1 || height < 1 || Math.max(width, height) > ROOM_REFERENCE_MAX_EDGE) throw new Error("参考照片尺寸超过限制，请通过上传入口压缩后再生成。");
      return;
    }
    offset += length;
  }
  throw new Error("参考照片无法读取，请重新选择。");
}
