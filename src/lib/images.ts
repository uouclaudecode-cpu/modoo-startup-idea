import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseEnv } from "./supabase/env";

export const MAX_UPLOAD_MB = 5;
const ACCEPT = ["image/jpeg", "image/png", "image/webp"];
export const IMAGE_ACCEPT = ACCEPT.join(",");

/** 공개 버킷(vehicle-images, community-images)의 사진 주소 */
export function publicImageUrl(bucket: "vehicle-images" | "community-images", path: string | null | undefined) {
  if (!path) return null;
  const { url } = supabaseEnv();
  return `${url}/storage/v1/object/public/${bucket}/${path}`;
}

export function vehicleImageUrl(path: string | null | undefined) {
  return publicImageUrl("vehicle-images", path);
}

/** 큰 사진 긴 변 · 목록용 작은 사진 긴 변 (px) */
const MAX_SIDE = 1280;
const THUMB_SIDE = 360;
/** WebP 화질 (같은 화질이면 JPG보다 30~50% 작아요) */
const QUALITY = 0.8;

/** 줄인 사진 (WebP를 못 만드는 브라우저는 JPG) */
export type PreparedImage = { blob: Blob; ext: "webp" | "jpg"; type: "image/webp" | "image/jpeg" };

/** 캔버스를 WebP로, 안 되면(예전 아이폰 Safari 등) JPG로 */
async function encode(canvas: HTMLCanvasElement): Promise<PreparedImage> {
  const webp = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", QUALITY));
  if (webp && webp.type === "image/webp") return { blob: webp, ext: "webp", type: "image/webp" };
  const jpg = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.8));
  if (!jpg) throw new Error("사진을 처리하지 못했어요. 다른 사진을 골라 주세요.");
  return { blob: jpg, ext: "jpg", type: "image/jpeg" };
}

function draw(bitmap: ImageBitmap, maxSide: number) {
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/**
 * 사진을 올리기 전에 확인하고 줄입니다. (저장 공간·전송량을 아끼려고)
 * - 이미지 파일(JPG·PNG·WEBP, 아이폰 HEIC는 브라우저가 변환한 경우만)만 허용
 * - 긴 변 1280px, WebP 화질 80%로 줄여서 보통 100~200KB가 돼요
 * - thumb: 목록에 작게 보이는 사진(긴 변 360px, 보통 10~20KB)도 함께 만들어요
 */
export async function prepareImage(file: File, { thumb = false } = {}): Promise<PreparedImage & { thumb: PreparedImage | null }> {
  if (!file.type.startsWith("image/")) throw new Error("사진 파일만 올릴 수 있어요.");
  if (file.size > 20 * 1024 * 1024) throw new Error("사진이 너무 커요. 20MB 이하 사진을 골라 주세요.");

  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) {
    // 브라우저가 열지 못하는 사진은 그대로 (허용 형식·크기만 확인)
    if (!ACCEPT.includes(file.type)) throw new Error("이 형식의 사진은 올릴 수 없어요. JPG·PNG 사진을 골라 주세요.");
    if (file.size > MAX_UPLOAD_MB * 1024 * 1024) throw new Error(`사진은 ${MAX_UPLOAD_MB}MB 이하만 올릴 수 있어요.`);
    const t = file.type === "image/webp" ? "webp" : "jpg";
    return { blob: file, ext: t, type: t === "webp" ? "image/webp" : "image/jpeg", thumb: null };
  }
  try {
    const main = await encode(draw(bitmap, MAX_SIDE));
    if (main.blob.size > MAX_UPLOAD_MB * 1024 * 1024) throw new Error(`사진은 ${MAX_UPLOAD_MB}MB 이하만 올릴 수 있어요.`);
    return { ...main, thumb: thumb ? await encode(draw(bitmap, THUMB_SIDE)) : null };
  } finally {
    bitmap.close();
  }
}

/** 큰 사진 경로 → 목록용 작은 사진 경로 (abc.webp → abc_t.webp) */
export function thumbPath(path: string) {
  return path.replace(/(.[a-z]+)$/i, "_t$1");
}

/** 사진 지울 때 함께 지울 경로 (작은 사진이 없으면 그냥 넘어가요) */
export function withThumb(paths: string[]) {
  return paths.flatMap((p) => [p, thumbPath(p)]);
}

/**
 * 사진을 줄여서 본인 폴더({사용자ID}/{무작위}.webp)에 올리고 경로를 돌려줍니다.
 * thumb: 목록용 작은 사진도 함께 올려요 (공개 사진만, 실패해도 큰 사진은 그대로 써요)
 * 실패하면 사용자에게 보여줄 문장을 담은 Error를 던집니다.
 */
export async function uploadPhoto(supabase: SupabaseClient, bucket: string, userId: string, file: File, { thumb = false } = {}) {
  const img = await prepareImage(file, { thumb });
  const path = `${userId}/${crypto.randomUUID()}.${img.ext}`;
  const { error } = await supabase.storage.from(bucket).upload(path, img.blob, { contentType: img.type, upsert: false });
  if (error) {
    console.error(error);
    throw new Error("사진을 올리지 못했어요. 다시 시도해 주세요.");
  }
  if (img.thumb) {
    const { error: tErr } = await supabase.storage.from(bucket).upload(thumbPath(path), img.thumb.blob, { contentType: img.thumb.type, upsert: false });
    if (tErr) console.error(tErr);
  }
  return path;
}

/** 프로필 사진: 가운데를 정사각형으로 잘라 512px JPEG로 줄여요. */
export async function prepareAvatar(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/")) throw new Error("사진 파일만 올릴 수 있어요.");
  if (file.size > 20 * 1024 * 1024) throw new Error("사진이 너무 커요. 20MB 이하 사진을 골라 주세요.");
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) throw new Error("이 형식의 사진은 올릴 수 없어요. JPG·PNG 사진을 골라 주세요.");
  const side = Math.min(bitmap.width, bitmap.height);
  const out = Math.min(512, side);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = out;
  canvas.getContext("2d")!.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, out, out);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
  if (!blob) throw new Error("사진을 처리하지 못했어요. 다른 사진을 골라 주세요.");
  return blob;
}

/** 프로필 사진 주소 (vehicle-images 버킷의 내 폴더) */
export function avatarUrl(path: string | null | undefined) {
  return publicImageUrl("vehicle-images", path);
}
