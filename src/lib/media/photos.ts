import { MAX_ROOM_REFERENCE_LENGTH, ROOM_REFERENCE_MAX_EDGE } from "../../room/agent/reference";

/** Shared image processing; each upload entry keeps its existing storage budget. */
const imageTypes = ["image/jpeg", "image/png", "image/webp"];
const photoError = "照片无法处理，请重新选择。";
const policies = {
  gift: { maxEdge: 900, quality: .78, white: false, minSize: 0 },
  frame: { maxEdge: 1200, quality: .86, white: true, minSize: 1 },
  reference: { maxEdge: ROOM_REFERENCE_MAX_EDGE, quality: .8, white: true, minSize: 1 },
};

function resize(image: CanvasImageSource, width: number, height: number, policy: typeof policies.gift, error: string) {
  const ratio = Math.min(1, policy.maxEdge / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(policy.minSize, Math.round(width * ratio));
  canvas.height = Math.max(policy.minSize, Math.round(height * ratio));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error(error);
  if (policy.white) { ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height); }
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas;
}

async function withImage<T>(file: File, process: (image: HTMLImageElement) => T): Promise<T> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image(); image.src = url; await image.decode();
    return process(image);
  } finally { URL.revokeObjectURL(url); }
}

function checkPhoto(file: File, maxMB: number) {
  if (!imageTypes.includes(file.type)) throw new Error("请选择 JPG、PNG 或 WebP 照片。");
  if (file.size > maxMB * 1024 * 1024) throw new Error(`照片超过 ${maxMB}MB，请选择较小的照片。`);
}

export async function prepareGiftPhoto(file: File): Promise<string> {
  checkPhoto(file, 12);
  try {
    return await withImage(file, image => resize(image, image.width, image.height, policies.gift, photoError).toDataURL("image/jpeg", policies.gift.quality));
  } catch { throw new Error(photoError); }
}

export async function prepareFramePhoto(file: File): Promise<string> {
  checkPhoto(file, 10);
  try {
    return await withImage(file, image => {
      if (!image.naturalWidth || !image.naturalHeight) throw new Error(photoError);
      const canvas = resize(image, image.naturalWidth, image.naturalHeight, policies.frame, photoError);
      const data = canvas.toDataURL("image/jpeg", policies.frame.quality);
      if (data.length > 1800000) throw new Error("照片仍然过大，请选择较小的照片。");
      return data;
    });
  } catch (error) {
    if (error instanceof Error && error.name !== "EncodingError") throw error;
    throw new Error(photoError);
  }
}

/** Re-encode locally so EXIF/GPS and full-resolution originals are not uploaded. */
export async function prepareRoomReference(file: File): Promise<string> {
  checkPhoto(file, 12);
  try {
    return await withImage(file, image => {
      const { naturalWidth: width, naturalHeight: height } = image;
      if (!width || !height || width * height > 32_000_000) throw new Error("照片尺寸过大或无法读取，请选择较小的房间照片。");
      const canvas = resize(image, width, height, policies.reference, photoError);
      for (const quality of [.8, .65, .5]) {
        const data = canvas.toDataURL("image/jpeg", quality);
        if (data.startsWith("data:image/jpeg;base64,") && data.length <= MAX_ROOM_REFERENCE_LENGTH) return data;
      }
      throw new Error("照片压缩后仍然过大，请选择较小的房间照片。");
    });
  } catch (error) {
    if (error instanceof Error && error.name !== "EncodingError") throw error;
    throw new Error("参考照片无法处理，请重新选择。");
  }
}
