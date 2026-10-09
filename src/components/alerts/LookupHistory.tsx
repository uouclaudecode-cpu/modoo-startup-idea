import { ScanSearch } from "lucide-react";
import { Card } from "@/components/ui";
import { LOOKUP_METHOD, type VehicleLookup } from "@/lib/alerts";
import { formatDateTime, timeAgo } from "@/lib/format";

const SHOW = 10;

/**
 * 받은 제보·대화 화면의 '구매 전 조회 기록' (주인만).
 * 누가 조회했는지는 저장하지 않아서 시간과 방법만 보여요.
 * '누군가 조회했어요' 알림이 #lookups 로 열려요.
 */
export function LookupHistory({ items, failed }: { items: VehicleLookup[]; failed: boolean }) {
  const stolen = items.filter((l) => l.stolen).length;
  return (
    <section id="lookups" aria-labelledby="lookups-title" className="scroll-mt-20">
      <Card className="space-y-3 p-4">
        <div className="flex items-center justify-between gap-3">
          <p id="lookups-title" className="flex items-center gap-2 font-bold">
            <ScanSearch aria-hidden className="h-5 w-5 text-brand-600" />
            구매 전 조회 기록
          </p>
          {items.length > 0 && <span className="flex-none text-[13px] text-ink-muted">최근 90일 {items.length}번</span>}
        </div>
        {failed ? (
          <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2.5 text-[14px] text-rose-700">
            조회 기록을 불러오지 못했어요. 잠시 후 새로고침해 주세요.
          </p>
        ) : items.length === 0 ? (
          <p className="text-[14px] leading-relaxed text-ink-muted">
            아직 조회 기록이 없어요. 누군가 구매 전 도난 조회(QR·조회 번호·차대번호)로 이 이동수단을 확인하면 여기에 남아요.
          </p>
        ) : (
          <>
            {stolen > 0 && (
              <p className="rounded-xl bg-orange-50 p-3 text-[14px] leading-relaxed text-orange-900">
                <b>수색 중에 {stolen}번 조회됐어요.</b> 중고로 거래되는 중일 수 있어요. 중고 앱에서 같은 모델 매물을 찾아보고, 찾으면 직접 만나러 가지 말고 112에 알려 주세요.
              </p>
            )}
            <ul className="divide-y divide-line/70 text-[14px]">
              {items.slice(0, SHOW).map((l, i) => (
                <li key={`${i}-${l.created_at}`} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0">
                    {formatDateTime(l.created_at)} <span className="text-ink-muted">({timeAgo(l.created_at)})</span>
                  </span>
                  <span className="flex-none font-semibold text-ink-soft">
                    {LOOKUP_METHOD[l.method]}
                    {l.stolen && <span className="ml-1 text-rose-600">· 수색 중</span>}
                  </span>
                </li>
              ))}
            </ul>
            {items.length > SHOW && <p className="text-[13px] text-ink-muted">그 전에 {items.length - SHOW}번 더 조회됐어요.</p>}
          </>
        )}
        <p className="text-[12px] text-ink-muted">누가 조회했는지는 저장하지 않아요. 시간과 방법만 남아요.</p>
      </Card>
    </section>
  );
}
