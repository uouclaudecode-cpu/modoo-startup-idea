import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** 판매 글을 읽어 올 수 있는 중고거래 사이트 (그 밖의 주소는 열지 않아요) */
/** 같은 곳(IP)에서 1분에 10번까지 (서버 한 대 기준, 가벼운 보호) */
const hits = new Map<string, number[]>();
function tooMany(ip: string) {
  const now = Date.now();
  const list = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return list.length > 10;
}

/** 응답 앞부분만 읽기 (큰 페이지를 통째로 받지 않게) */
async function readCapped(r: Response, max: number) {
  if (!r.body) return "";
  const reader = r.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size < max) {
    const { done, value } = await reader.read();
    if (done || !value) break;
    chunks.push(value);
    size += value.length;
  }
  reader.cancel().catch(() => {});
  return new TextDecoder().decode(Buffer.concat(chunks).subarray(0, max));
}

const HOSTS = ["daangn.com", "bunjang.co.kr", "joongna.com", "web.joongna.com"];
const allowed = (h: string) => HOSTS.some((x) => h === x || h.endsWith(`.${x}`));

const decode = (s: string) =>
  s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

function meta(html: string, prop: string) {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=(["'])(.*?)\\1|<meta[^>]+content=(["'])(.*?)\\3[^>]*(?:property|name)=["']${prop}["']`, "i");
  const m = html.match(re);
  return m ? decode(m[2] ?? m[4] ?? "").trim() : "";
}

/** 판매 글 주소에서 제목·설명·사진만 읽어요 (최대 3번 이동, 5초, 앞부분 800KB) */
async function readListing(raw: string) {
  let url = new URL(raw);
  for (let i = 0; i < 4; i++) {
    if (url.protocol !== "https:" || !allowed(url.hostname)) return null;
    const r = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(5000),
      headers: { "user-agent": "Mozilla/5.0 (compatible; B-LOCK listing check)", accept: "text/html" },
      cache: "no-store",
    });
    if (r.status >= 300 && r.status < 400 && r.headers.get("location")) {
      url = new URL(r.headers.get("location")!, url);
      continue;
    }
    if (!r.ok) return null;
    const html = await readCapped(r, 800_000);
    const title = meta(html, "og:title") || decode(html.match(/<title>([^<]*)<\/title>/i)?.[1] ?? "").trim();
    const description = meta(html, "og:description") || meta(html, "description");
    const image = meta(html, "og:image");
    if (!title && !description) return null;
    return { title: title.slice(0, 200), description: description.slice(0, 1000), image: image.startsWith("https://") ? image : null };
  }
  return null;
}

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (tooMany(ip)) return NextResponse.json({ error: "너무 자주 확인했어요. 1분 뒤에 다시 시도해 주세요." }, { status: 429 });
  const body = (await req.json().catch(() => null)) as { input?: unknown } | null;
  const input = typeof body?.input === "string" ? body.input.trim().slice(0, 4000) : "";
  if (input.length < 2) return NextResponse.json({ error: "판매 글 주소나 내용을 넣어 주세요." }, { status: 400 });

  let listing: Awaited<ReturnType<typeof readListing>> = null;
  let fetched: "ok" | "failed" | "text" = "text";
  const link = input.match(/https?:\/\/[^\s]+/)?.[0];
  if (link) {
    try {
      listing = await readListing(link);
    } catch (e) {
      console.error("판매 글을 읽지 못했어요", e);
    }
    fetched = listing ? "ok" : "failed";
  }
  // 주소 말고 같이 붙여 넣은 글도 비교에 써요
  const extra = input.replace(/https?:\/\/[^\s]+/g, " ").trim();
  const text = [listing?.title, listing?.description, extra].filter(Boolean).join(" ");
  // QR 아래 조회 번호(8자리) 같아 보이는 것
  const codes = Array.from(new Set((text.toUpperCase().match(/\b[A-HJKMNP-Z2-9]{4}[\s-]?[A-HJKMNP-Z2-9]{4}\b/g) ?? []).map((c) => c.replace(/[\s-]/g, "")))).filter((c) => /\d/.test(c)).slice(0, 3);

  if (!text) return NextResponse.json({ fetched, listing, matches: [], codes });
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("match_stolen_listing", { p_text: text });
  if (error) {
    console.error(error);
    return NextResponse.json({ error: "비교하지 못했어요. 잠시 후 다시 시도해 주세요." }, { status: 500 });
  }
  return NextResponse.json({ fetched, listing, matches: data ?? [], codes });
}
