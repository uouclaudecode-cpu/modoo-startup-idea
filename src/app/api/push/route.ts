import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Urgency } from "web-push";
import { supabaseEnv } from "@/lib/supabase/env";
import { sendWebPush, type PushTarget } from "@/lib/webPush";

// web-push 는 Node.js 암호화 기능을 써서 Edge 가 아닌 Node 런타임에서 실행해요.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 데이터베이스(pg_net)가 부르는 알림 보내기 창구.
 * 제보·댓글 트리거와 매일 정비 알림이 받는 사람의 기기 목록과 문구를 보내면, 여기서 웹 푸시로 전달해요.
 * 로그인 대신 데이터베이스와 서버만 아는 비밀값(x-push-secret)으로 확인합니다.
 */
export async function POST(request: NextRequest) {
  const expected = process.env.PUSH_WEBHOOK_SECRET;
  if (!expected) {
    return NextResponse.json({ error: "push not configured" }, { status: 503 });
  }
  if (!secretMatches(request.headers.get("x-push-secret"), expected)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const input = parseBody(raw);
  if (!input) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const result = await sendWebPush(input.subscriptions, input.message, { urgency: input.urgency, ttl: 3600 });
  if (!result) {
    return NextResponse.json({ error: "vapid not configured" }, { status: 503 });
  }

  // 끝난 구독은 데이터베이스에서 지워요. 서비스 키 없이, 같은 비밀값을 아는 함수로만 지울 수 있어요.
  let removed = 0;
  if (result.gone.length > 0) {
    try {
      const { url, key } = supabaseEnv();
      const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
      const { data, error } = await supabase.rpc("remove_push_endpoints", { p_secret: expected, p_endpoints: result.gone });
      if (error) console.error("끝난 알림 구독 지우기 실패", error);
      else removed = typeof data === "number" ? data : 0;
    } catch (e) {
      console.error("끝난 알림 구독 지우기 실패", e);
    }
  }

  return NextResponse.json({ sent: result.sent, failed: result.failed, skipped: result.skipped, removed });
}

/** 길이가 같을 때만 비교 (timingSafeEqual 은 길이가 다르면 오류) — 걸리는 시간으로 비밀값을 추측하지 못하게 */
function secretMatches(given: string | null, expected: string) {
  if (!given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

const URGENCIES: Urgency[] = ["very-low", "low", "normal", "high"];

function str(v: unknown, max: number, { allowEmpty = false } = {}): string | null {
  if (typeof v !== "string" || v.length > max) return null;
  if (!allowEmpty && v.length === 0) return null;
  return v;
}

/** 알림 문구: 너무 길면 거절하지 않고 글자 단위(이모지 포함)로 잘라요. */
function text(v: unknown, max: number, { allowEmpty = false } = {}): string | null {
  if (typeof v !== "string") return null;
  const chars = Array.from(v);
  const out = chars.length > max ? chars.slice(0, max - 1).join("") + "…" : v;
  if (!allowEmpty && out.length === 0) return null;
  return out;
}

/** 사이트 안 경로만 (//다른사이트, /\다른사이트 같은 바깥 주소 막기) */
function safePath(v: unknown) {
  const s = str(v, 300);
  if (!s || !s.startsWith("/") || s.startsWith("//") || s.includes("\\")) return null;
  return s;
}

function parseBody(raw: unknown) {
  if (!raw || typeof raw !== "object") return null;
  const b = raw as Record<string, unknown>;
  if (!Array.isArray(b.subscriptions) || b.subscriptions.length === 0 || b.subscriptions.length > 50) return null;

  const subscriptions: PushTarget[] = [];
  for (const item of b.subscriptions) {
    if (!item || typeof item !== "object") return null;
    const s = item as Record<string, unknown>;
    const endpoint = str(s.endpoint, 1000);
    const p256dh = str(s.p256dh, 200);
    const auth = str(s.auth, 100);
    if (!endpoint || !p256dh || !auth) return null;
    subscriptions.push({ endpoint, p256dh, auth });
  }

  const title = text(b.title, 100);
  const body = text(b.body, 300, { allowEmpty: true });
  const url = safePath(b.url);
  if (!title || body === null || !url) return null;

  const tag = b.tag == null ? null : str(b.tag, 100);
  if (b.tag != null && !tag) return null;

  const urgency: Urgency = URGENCIES.includes(b.urgency as Urgency) ? (b.urgency as Urgency) : "normal";
  return { subscriptions, message: { title, body, url, tag }, urgency };
}
