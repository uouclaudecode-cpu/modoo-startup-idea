import { appIconResponse, ICON_V } from "@/lib/appIcon";

const FILES = ["icon-192", "icon-512", "maskable-192", "maskable-512"].map((f) => `${f}-${ICON_V}.png`);

export const dynamic = "force-static";
export const dynamicParams = false;
export function generateStaticParams() {
  return FILES.map((file) => ({ file }));
}

/** /icons/icon-192-v2.png 등 앱 설치용 아이콘 (빌드할 때 한 번 만들어 둠) */
export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const m = /^(icon|maskable)-(192|512)-(v\d+)\.png$/.exec(file);
  if (m && m[3] !== ICON_V) return new Response("Not found", { status: 404 });
  if (!m) return new Response("Not found", { status: 404 });
  return appIconResponse(Number(m[2]), { maskable: m[1] === "maskable" });
}
