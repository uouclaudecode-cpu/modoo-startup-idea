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

type Row = { key: string; href: string; title: string; sub: string; at: string; isNew: boolean; img: string | null; type: Vehicle["type"] };

/**
 * 대화 모아 보기 (머리글 💬): 내 이동수단에 온 제보 대화 + 내가 보낸 제보 대화
 * 누르면 바로 그 대화로 가요.
 */
export default async function ChatsPage() {
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
      key: `out-${r.id}`,
      href: `/r#rid=${r.id}`,
      title: [r.color, r.brand, typeLabel(r.type)].filter(Boolean).join(" "),
      sub: reportTodo(r) ? "주인이 답장했어요" : r.owner_msgs > 0 ? `주인 답장 ${r.owner_msgs}개` : "답장을 기다리는 중",
      at: r.created_at,
      isNew: reportTodo(r),
      img: r.image_path,
      type: r.type,
    }));

  const sortRows = (rows: Row[]) => rows.sort((a, b) => Number(b.isNew) - Number(a.isNew) || b.at.localeCompare(a.at));

  return (
    <div className="mx-auto max-w-md space-y-5">
      <h1 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight">
        <MessageCircle aria-hidden className="h-6 w-6 text-brand-600" />
        대화
      </h1>
      {received.length === 0 && mine.length === 0 ? (
        <EmptyState icon={<MessageCircle className="h-7 w-7" />} title="아직 대화가 없어요" description="QR 제보로 시작된 대화가 여기에 모여요." />
      ) : (
        <>
          {received.length > 0 && <ChatList title="내 이동수단에 온 대화" rows={sortRows(received)} />}
          {mine.length > 0 && <ChatList title="내가 보낸 제보 대화" rows={sortRows(mine)} />}
        </>
      )}
    </div>
  );
}

function ChatList({ title, rows }: { title: string; rows: Row[] }) {
  return (
    <section className="space-y-2">
      <h2 className="px-1 text-[13px] font-bold text-ink-muted">{title}</h2>
      <Card className="divide-y divide-line/70 p-0">
        {rows.map((r) => (
          <Link key={r.key} href={r.href} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50">
            <VehicleImage thumb src={vehicleImageUrl(r.img)} type={r.type} alt={r.title} className="h-12 w-12 flex-none rounded-xl" />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5">
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
