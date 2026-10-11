import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, MessageCircle } from "lucide-react";
import { reportTodo, type MyReport } from "@/components/alerts/MyAlerts";
import { Card, EmptyState } from "@/components/ui";
import { VehicleImage } from "@/components/vehicle/VehicleImage";
import { timeAgo } from "@/lib/format";
import { vehicleImageUrl } from "@/lib/images";
import { createClient } from "@/lib/supabase/server";
import { typeLabel, type Vehicle } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "대화" };

type Tab = "all" | "in" | "out" | "new";
const TABS: { value: Tab; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "new", label: "새 메시지" },
  { value: "in", label: "받은 대화" },
  { value: "out", label: "보낸 대화" },
];

type Row = { dir: "in" | "out"; key: string; href: string; title: string; sub: string; at: string; isNew: boolean; img: string | null; type: Vehicle["type"] };

/**
 * 대화 모아 보기 (머리글 💬): 내 이동수단에 온 제보 대화 + 내가 보낸 제보 대화
 * 누르면 바로 그 대화로 가요.
 */
export default async function ChatsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab: rawTab } = await searchParams;
  const tab: Tab = TABS.some((t) => t.value === rawTab) ? (rawTab as Tab) : "all";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/chats");

  const since = new Date(Date.now() - 30 * 86400e3).toISOString();
  const [{ data: vehicles }, { data: sent }] = await Promise.all([
    supabase.from("vehicles").select("id, name, type, image_path").eq("owner_id", user.id).is("deleted_at", null),
    supabase.rpc("my_reports"),
  ]);
  const myVehicles = (vehicles ?? []) as Pick<Vehicle, "id" | "name" | "type" | "image_path">[];

  // ① 받은 대화: 내 이동수단에 온 '익명 대화' 제보 (최근 30일)
  let received: Row[] = [];
  if (myVehicles.length) {
    const { data: reports } = await supabase
      .from("reports")
      .select("id, vehicle_id, description, created_at")
      .in(
        "vehicle_id",
        myVehicles.map((v) => v.id),
      )
      .eq("contact_mode", "chat")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(20);
    const ids = (reports ?? []).map((r) => r.id);
    const { data: msgs } = ids.length
      ? await supabase.from("report_messages").select("report_id, sender, body, created_at").in("report_id", ids).order("created_at", { ascending: false })
      : { data: [] };
    received = (reports ?? []).map((r) => {
      const v = myVehicles.find((x) => x.id === r.vehicle_id)!;
      const last = (msgs ?? []).find((m) => m.report_id === r.id);
      return {
        dir: "in" as const,
        key: `in-${r.id}`,
        href: `/vehicles/${r.vehicle_id}/reports#r-${r.id}`,
        title: v?.name ?? "내 이동수단",
        sub: last ? `${last.sender === "finder" ? "" : "나: "}${last.body}` : r.description,
        at: (last?.created_at as string | undefined) ?? r.created_at,
        // 발견자가 마지막으로 보냈거나, 아직 아무도 말하지 않은 3일 안의 제보
        isNew: last ? last.sender === "finder" : Date.now() - new Date(r.created_at).getTime() < 3 * 86400e3,
        img: v?.image_path ?? null,
        type: v?.type ?? "bicycle",
      };
    });
  }

  // ② 보낸 대화: 내가 QR로 보낸 제보 중 대화를 고른 것
  const mine: Row[] = ((sent ?? []) as MyReport[])
    .filter((r) => r.chat)
    .map((r) => ({
      dir: "out" as const,
      key: `out-${r.id}`,
      href: `/r#rid=${r.id}`,
      title: [r.color, r.brand, typeLabel(r.type)].filter(Boolean).join(" "),
      sub: reportTodo(r) ? "주인이 답장했어요" : r.owner_msgs > 0 ? `주인 답장 ${r.owner_msgs}개` : "답장을 기다리는 중",
      at: r.created_at,
      isNew: reportTodo(r),
      img: r.image_path,
      type: r.type,
    }));

  // 받은 대화와 보낸 대화를 한 목록에, 최근 순으로
  const all = [...received, ...mine].sort((a, b) => b.at.localeCompare(a.at));
  const rows = all.filter((r) => (tab === "all" ? true : tab === "new" ? r.isNew : r.dir === tab));
  const newCount = all.filter((r) => r.isNew).length;

  return (
    <div className="mx-auto max-w-md space-y-5">
      <h1 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight">
        <MessageCircle aria-hidden className="h-6 w-6 text-brand-600" />
        대화
      </h1>
      {/* 거르기 */}
      <nav aria-label="대화 거르기" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {TABS.map((t) => (
          <Link
            key={t.value}
            href={t.value === "all" ? "/chats" : `/chats?tab=${t.value}`}
            replace
            scroll={false}
            aria-current={tab === t.value ? "true" : undefined}
            className={`inline-flex h-9 flex-none items-center gap-1 whitespace-nowrap rounded-full px-3.5 text-sm font-semibold ring-1 ring-inset ${
              tab === t.value ? "bg-ink text-white ring-ink" : "bg-white text-ink-soft ring-line hover:bg-slate-50"
            }`}
          >
            {t.label}
            {t.value === "new" && newCount > 0 && <span className="rounded-full bg-rose-600 px-1.5 text-[11px] font-bold text-white">{newCount}</span>}
          </Link>
        ))}
      </nav>
      {rows.length === 0 ? (
        <EmptyState
          icon={<MessageCircle className="h-7 w-7" />}
          title={tab === "new" ? "새 메시지가 없어요" : tab === "out" ? "보낸 제보 대화가 없어요" : tab === "in" ? "받은 대화가 없어요" : "아직 대화가 없어요"}
          description={tab === "out" ? "로그인한 채로 QR 제보를 보내면 여기에 모여요." : "QR 제보로 시작된 대화가 여기에 모여요."}
        />
      ) : (
        <ChatList rows={rows} />
      )}
    </div>
  );
}

function ChatList({ rows }: { rows: Row[] }) {
  return (
    <section>
      <Card className="divide-y divide-line/70 p-0">
        {rows.map((r) => (
          <Link key={r.key} href={r.href} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50">
            <VehicleImage thumb src={vehicleImageUrl(r.img)} type={r.type} alt={r.title} className="h-12 w-12 flex-none rounded-xl" />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5">
                <span className={`flex-none rounded px-1 py-px text-[11px] font-bold ${r.dir === "in" ? "bg-brand-50 text-brand-700" : "bg-amber-50 text-amber-800"}`}>
                  {r.dir === "in" ? "받음" : "보냄"}
                </span>
                <span className="min-w-0 truncate text-[15px] font-bold">{r.title}</span>
                {r.isNew && <span className="flex-none rounded-full bg-rose-600 px-1.5 py-0.5 text-[11px] font-bold text-white">새 메시지</span>}
              </span>
              <span className={`block truncate text-[13px] ${r.isNew ? "font-semibold text-ink" : "text-ink-muted"}`}>{r.sub}</span>
            </span>
            <span className="flex-none text-[12px] text-ink-faint">{timeAgo(r.at)}</span>
            <ChevronRight aria-hidden className="h-4 w-4 flex-none text-ink-faint" />
          </Link>
        ))}
      </Card>
    </section>
  );
}
