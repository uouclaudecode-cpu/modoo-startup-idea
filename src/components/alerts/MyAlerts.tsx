import Link from "next/link";
import { ChevronRight, ClipboardList } from "lucide-react";
import { Card } from "@/components/ui";
import { VehicleImage } from "@/components/vehicle/VehicleImage";
import { ALERT_STATUS, vehicleTitle, type MyAlert } from "@/lib/alerts";
import { timeAgo } from "@/lib/format";
import { vehicleImageUrl } from "@/lib/images";

/** 할 일이 있는 경보인지 (사례금 처리·새 제보) */
export const alertTodo = (a: MyAlert) => a.reward_todo > 0 || (a.role === "owner" && a.status === "open" && a.new_sightings > 0);

/**
 * /alerts 아래 '내 경보·제보': 끝난 경보도 다시 열어서
 * 주인은 사례금 '보냈어요', 제보자는 '받았어요'·'못 받았어요'를 누를 수 있어요.
 * MY 등에서 /alerts#mine 으로 바로 올 수 있어요.
 */
export function MyAlerts({ items, failed }: { items: MyAlert[]; failed: boolean }) {
  // 할 일이 있는 것 먼저, 그다음 최근 순
  const list = [...items].sort((a, b) => Number(alertTodo(b)) - Number(alertTodo(a)) || b.created_at.localeCompare(a.created_at));
  return (
    <section id="mine" aria-labelledby="mine-title" className="scroll-mt-20">
      <Card className="space-y-3 p-4">
        <p id="mine-title" className="flex items-center gap-2 font-bold">
          <ClipboardList aria-hidden className="h-5 w-5 text-brand-600" />
          내 경보·제보
        </p>
        {failed ? (
          <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2.5 text-[14px] text-rose-700">
            내 경보·제보를 불러오지 못했어요. 잠시 후 새로고침해 주세요.
          </p>
        ) : list.length === 0 ? (
          <p className="text-[14px] leading-relaxed text-ink-muted">내가 보낸 도난 경보나 목격 제보가 아직 없어요. 경보가 끝난 뒤에도 사례금 확인은 여기서 할 수 있어요.</p>
        ) : (
          <ul className="divide-y divide-line/70">
            {list.map((a) => {
              const title = a.role === "owner" ? (a.vehicle_name || vehicleTitle(a)) : vehicleTitle(a);
              const todo =
                a.reward_todo > 0
                  ? a.role === "owner"
                    ? `사례금 보내기 ${a.reward_todo}건`
                    : `사례금 확인 ${a.reward_todo}건`
                  : a.role === "owner" && a.status === "open" && a.new_sightings > 0
                    ? `새 제보 ${a.new_sightings}건`
                    : null;
              return (
                <li key={`${a.role}-${a.id}`}>
                  <Link href={`/alerts/${a.id}`} className="flex items-center gap-3 py-2.5">
                    <VehicleImage thumb src={vehicleImageUrl(a.image_path)} type={a.type} alt={title} className="h-14 w-14 flex-none rounded-xl" />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-x-1.5 text-[13px] text-ink-muted">
                        <span className={`font-semibold ${a.role === "owner" ? "text-rose-600" : "text-brand-700"}`}>{a.role === "owner" ? "내 경보" : "내 제보"}</span>
                        <span>· {ALERT_STATUS[a.status]}</span>
                        <span>· {timeAgo(a.created_at)}</span>
                      </span>
                      <span className="block truncate text-[15px] font-bold">{title}</span>
                      <span className="block text-[13px] text-ink-muted">
                        {a.role === "owner" ? `들어온 제보 ${a.sighting_count}건` : `내가 보낸 제보 ${a.sighting_count}건`}
                        {todo && <span className="ml-1.5 font-bold text-rose-600">· {todo}</span>}
                      </span>
                    </span>
                    <ChevronRight aria-hidden className="h-4 w-4 flex-none text-ink-faint" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </section>
  );
}
