import { supabaseEnv } from "./supabase/env";

export const MAX_UPLOAD_MB = 5;
const ACCEPT = ["image/jpeg", "image/png", "image/webp"];
export const IMAGE_ACCEPT = ACCEPT.join(",");

/** 공개 버킷(vehicle-images)의 사진 주소 */
export function vehicleImageUrl(path: string | null | undefined) {
  if (!path) return null;
  const { url } = supabaseEnv();
  return `${url}/storage/v1/object/public/vehicle-images/${path}`;
}

/**
 * 사진을 올리기 전에 확인하고 줄입니다.
 * - 이미지 파일(JPG·PNG·WEBP, 아이폰 HEIC는 브라우저가 변환한 경우만)만 허용
 * - 긴 변 1600px, JPEG 품질 0.82로 줄여서 대부분 1MB 이하로 만듭니다
 */
export async function prepareImage(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/")) throw new Error("사진 파일만 올릴 수 있어요.");
  if (file.size > 20 * 1024 * 1024) throw new Error("사진이 너무 커요. 20MB 이하 사진을 골라 주세요.");

  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) {
    if (!ACCEPT.includes(file.type)) throw new Error("이 형식의 사진은 올릴 수 없어요. JPG·PNG 사진을 골라 주세요.");
    if (file.size > MAX_UPLOAD_MB * 1024 * 1024) throw new Error(`사진은 ${MAX_UPLOAD_MB}MB 이하만 올릴 수 있어요.`);
    return file;
  }
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
  if (!blob) throw new Error("사진을 처리하지 못했어요. 다른 사진을 골라 주세요.");
  if (blob.size > MAX_UPLOAD_MB * 1024 * 1024) throw new Error(`사진은 ${MAX_UPLOAD_MB}MB 이하만 올릴 수 있어요.`);
  return blob;
}
