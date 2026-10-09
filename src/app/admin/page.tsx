import type { Metadata } from "next";
import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { Bike, ChevronRight, Flag, Megaphone, Printer, QrCode, RefreshCw, Route, SearchCheck, Users, BadgeCheck, Siren } from "lucide-react";
import { BarChart, type BarDatum } from "@/components/admin/BarChart";
import { RATE_TEXT, RateBar, rateTone } from "@/components/admin/RateBar";
import { StatCard } from "@/components/admin/StatCard";
import { ButtonLink, Card, EmptyState, ErrorState } from "@/components/ui";
import { requireAdmin } from "@/lib/admin";
import { CleanupQueue } from "./CleanupQueue";
import {
  formatCount,
  formatPercent,
  normalizeAdminStats,
  ratio,
  weekLabel,
  weekLabelLong,
  type AdminStats,
  type WeeklyPoint,
} from "@/lib/adminStats";
import { cn } from "@/lib/cn";
import { formatDate, formatDateTime, friendlyError } from "@/lib/format";
import { VEHICLE_TYPES } from "@/lib/types";

export const metadata: Metadata = { title: "운영 통계", robots: { index: false } };

/** SQL 에서 최근 100묶음까지만 돌려줘요 (그 이상은 스티커 관리 화면에서) */
const BATCH_LIMIT = 100;

/** 관리자 홈: 서비스가 얼마나 쓰이는지 숫자와 주별 추이로 한눈에 */
export default async function AdminHomePage() {
  const { supabase } = await requireAdmin("/admin");
  const { data, error } = await supabase.rpc("admin_stats");

  if (error) {
    console.error(error);
    // PGRST202: 함수를 찾지 못함 → 007_admin_stats.sql 을 아직 실행하지 않은 경우
    const missing = error.code === "PGRST202";
    return (
      <div className="mx-auto max-w-xl space-y-5">
        <PageHeader />
        <QuickLinks />
        <ErrorState
          title="통계를 불러오지 못했어요"
          description={
            missing
              ? "Supabase에 supabase/007_admin_stats.sql 을 아직 실행하지 않은 것 같아요. 실행한 뒤 다시 불러와 주세요."
              : friendlyError(error, "인터넷 연결을 확인하고 다시 불러와 주세요.")
          }
          action={
            <ButtonLink href="/admin" prefetch={false} variant="secondary" full icon={<RefreshCw aria-hidden className="h-4 w-4" />}>
              다시 불러오기
            </ButtonLink>
          }
        />
      </div>
    );
  }

  const s = normalizeAdminStats(data);
  // 지운 글·댓글·제보의 사진 중 아직 저장소에 남은 것 (012_review_fixes.sql)
  const { count: cleanupCount, error: cleanupErr } = await supabase.from("storage_cleanup_queue").select("path", { count: "exact", head: true });
  if (cleanupErr) console.error(cleanupErr);
  const stickerRate = ratio(s.stickers_claimed, s.stickers_total);

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <PageHeader generatedAt={s.generated_at} />
      <QuickLinks />
      <KpiGrid s={s} stickerRate={stickerRate} />
      <NowStrip s={s} />
      <WeeklyCharts weekly={s.weekly} />
      <BatchTable batches={s.batches} />
      <CleanupQueue count={cleanupCount ?? 0} />
    </div>
  );
}

function PageHeader({ generatedAt }: { generatedAt?: string | null }) {
  return (
    <div>
      <h1 className="text-2xl font-extrabold tracking-tight">📊 운영 통계</h1>
      <p className="mt-1 text-sm leading-relaxed text-ink-muted">
        B-LOCK이 지금 얼마나 쓰이고 있는지 한눈에 봐요.
        {generatedAt && <span className="tabular-nums"> {formatDateTime(generatedAt)} 기준</span>}
      </p>
    </div>
  );
}

function QuickLinks() {
  return (
    <nav aria-label="관리 메뉴" className="grid grid-cols-2 gap-2">
      <ButtonLink href="/admin/stickers" variant="secondary" icon={<Printer aria-hidden className="h-4 w-4" />}>
        스티커 관리
      </ButtonLink>
      <ButtonLink href="/admin/reports" variant="secondary" icon={<Flag aria-hidden className="h-4 w-4" />}>
        신고 처리
      </ButtonLink>
      <ButtonLink href="/admin/members" variant="secondary" icon={<BadgeCheck aria-hidden className="h-4 w-4" />}>
        회원 본인인증
      </ButtonLink>
      <ButtonLink href="/admin/alerts" variant="secondary" icon={<Siren aria-hidden className="h-4 w-4" />}>
        경보 신고
      </ButtonLink>
    </nav>
  );
}

/** "+3명" (0이면 흐리게, 늘었으면 초록) */
function Delta({ n, unit, label }: { n: number; unit: string; label: string }) {
  return (
    <span className="whitespace-nowrap">
      {label}{" "}
      <b className={cn("font-semibold tabular-nums", n > 0 ? "text-emerald-700" : "text-ink-muted")}>
        +{formatCount(n)}
        {unit}
      </b>
    </span>
  );
}

/** "A · B" 로 이어 보여주되, 좁은 화면에서 줄이 바뀔 때는 조각 사이에서만 바뀌게 ("49 / 건"처럼 끊기지 않도록) */
function Parts({ items }: { items: ReactNode[] }) {
  return (
    <span className="tabular-nums">
      {items.map((it, i) => (
        <Fragment key={i}>
          {i > 0 && " · "}
          <span className="whitespace-nowrap">{it}</span>
        </Fragment>
      ))}
    </span>
  );
}

function KpiGrid({ s, stickerRate }: { s: AdminStats; stickerRate: number | null }) {
  const icon = "h-4 w-4";
  return (
    <section aria-labelledby="kpi-title" className="space-y-3">
      <h2 id="kpi-title" className="sr-only">
        핵심 숫자
      </h2>
      <ul className="grid grid-cols-2 gap-3">
        <li>
          <StatCard icon={<Users className={icon} />} label="가입자" value={formatCount(s.users_total)} unit="명" sub={<Delta n={s.users_7d} unit="명" label="최근 7일" />} />
        </li>
        <li>
          <StatCard
            icon={<Bike className={icon} />}
            label="등록 이동수단"
            value={formatCount(s.vehicles_total)}
            unit="대"
            sub={
              <span className="flex flex-wrap gap-x-2 gap-y-0.5">
                {VEHICLE_TYPES.map((t) => (
                  <span key={t.value} className="whitespace-nowrap tabular-nums">
                    <span aria-hidden>{t.emoji}</span>
                    <span className="sr-only">{t.label}</span> {formatCount(s.vehicles_by_type[t.value])}
                  </span>
                ))}
              </span>
            }
          />
        </li>
        <li>
          <StatCard
            icon={<QrCode className={icon} />}
            label="스티커 등록률"
            value={formatPercent(stickerRate)}
            tone="emerald"
            sub={
              s.stickers_total > 0 ? (
                <span className="tabular-nums">
                  {formatCount(s.stickers_claimed)} / {formatCount(s.stickers_total)}장 등록
                </span>
              ) : (
                "아직 만든 스티커가 없어요"
              )
            }
          >
            <RateBar ratio={stickerRate} label={`스티커 등록률 ${formatPercent(stickerRate)}`} />
          </StatCard>
        </li>
        <li>
          <StatCard
            icon={<SearchCheck className={icon} />}
            label="분실 글 · 회수율"
            value={formatCount(s.posts_total)}
            unit="건"
            tone="amber"
            sub={
              <Parts
                items={[
                  <>
                    회수율 <b className={cn("font-semibold", RATE_TEXT[rateTone(s.recovery_rate)])}>{formatPercent(s.recovery_rate)}</b>
                  </>,
                  `찾는 중 ${formatCount(s.posts_open)}건`,
                ]}
              />
            }
          >
            <RateBar ratio={s.recovery_rate} label={`분실 글 회수율 ${formatPercent(s.recovery_rate)}`} />
          </StatCard>
        </li>
        <li>
          <StatCard
            icon={<Megaphone className={icon} />}
            label="발견 제보"
            value={formatCount(s.finder_reports_total)}
            unit="건"
            tone="rose"
            sub={<Delta n={s.finder_reports_7d} unit="건" label="최근 7일" />}
          />
        </li>
        <li>
          {/* 100km가 넘으면 소수점은 빼서 좁은 카드에서도 한 줄에 들어가게 */}
          <StatCard
            icon={<Route className={icon} />}
            label="라이딩 총 거리"
            value={s.rides_km_total.toLocaleString("ko-KR", { maximumFractionDigits: s.rides_km_total >= 100 ? 0 : 1 })}
            unit="km"
            sub={<Parts items={[`${formatCount(s.rides_total)}회`, `30일 라이더 ${formatCount(s.riders_30d)}명`]} />}
          />
        </li>
      </ul>
    </section>
  );
}

/** 지금 상태: 수색 중 · 회수 완료 이동수단 (이동수단 상태 이름과 같게) · 댓글 */
function NowStrip({ s }: { s: AdminStats }) {
  const items = [
    { label: "수색 중 이동수단", value: s.vehicles_searching, unit: "대", className: "text-rose-700" },
    { label: "회수 완료 이동수단", value: s.vehicles_recovered, unit: "대", className: "text-emerald-700" },
    { label: "커뮤니티 댓글", value: s.comments_total, unit: "개", className: "text-ink" },
  ];
  return (
    <section aria-labelledby="now-title" className="space-y-2">
      <h2 id="now-title" className="font-bold">
        지금 상황
      </h2>
      <Card className="p-0">
        <dl className="grid grid-cols-3 divide-x divide-line">
          {items.map((it) => (
            <div key={it.label} className="flex flex-col-reverse items-center gap-0.5 px-2 py-4 text-center">
              {/* break-keep: 좁은 칸에서도 "이동수/단"처럼 낱말 중간에서 끊기지 않게 */}
              <dt className="break-keep text-[12px] leading-tight text-ink-muted">{it.label}</dt>
              <dd className={cn("text-xl font-extrabold tabular-nums", it.className)}>
                {formatCount(it.value)}
                <span className="ml-0.5 text-[13px] font-semibold text-ink-muted">{it.unit}</span>
              </dd>
            </div>
          ))}
        </dl>
      </Card>
    </section>
  );
}

function WeeklyCharts({ weekly }: { weekly: WeeklyPoint[] }) {
  const series = (key: Exclude<keyof WeeklyPoint, "week_start">): BarDatum[] =>
    weekly.map((w) => ({ label: weekLabel(w.week_start), longLabel: weekLabelLong(w.week_start), value: w[key] }));
  return (
    <section aria-labelledby="weekly-title" className="space-y-3">
      <div>
        <h2 id="weekly-title" className="font-bold">
          최근 8주 추이
        </h2>
        <p className="mt-0.5 text-[13px] leading-relaxed text-ink-muted">
          월요일부터 일요일까지 한 주로 묶어요 (한국 시간). 진한 막대는 아직 진행 중인 이번 주예요.
        </p>
      </div>
      <BarChart title="가입자" data={series("signups")} unit="명" tone="brand" highlightLast />
      <BarChart title="분실 글" data={series("lost_posts")} unit="건" tone="amber" highlightLast />
      <BarChart
        title="회수 완료"
        description="'찾았어요'로 바꾼 시각 기준으로 셉니다. 다시 '찾는 중'으로 돌리면 빠져요."
        data={series("resolved_posts")}
        unit="건"
        tone="emerald"
        highlightLast
      />
      <BarChart title="라이딩" data={series("rides")} unit="회" tone="brand" highlightLast />
    </section>
  );
}

function BatchTable({ batches }: { batches: AdminStats["batches"] }) {
  return (
    <section aria-labelledby="batch-title" className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <h2 id="batch-title" className="font-bold">
          스티커 묶음별 등록
        </h2>
        <Link
          href="/admin/stickers"
          className="-mr-2 inline-flex min-h-11 items-center gap-0.5 rounded-lg px-2 text-sm font-semibold text-brand-700 hover:bg-brand-50"
        >
          스티커 관리
          <ChevronRight aria-hidden className="h-4 w-4" />
        </Link>
      </div>

      {batches.length === 0 ? (
        <EmptyState
          icon={<Printer className="h-7 w-7" />}
          title="아직 만든 스티커 묶음이 없어요"
          description="학교·편의점에 둘 스티커를 만들면 묶음마다 얼마나 등록됐는지 여기서 볼 수 있어요."
          action={
            <ButtonLink href="/admin/stickers" full>
              스티커 만들러 가기
            </ButtonLink>
          }
        />
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">스티커 묶음별 장수, 등록 수, 등록률 (새 묶음 먼저)</caption>
              <thead className="bg-slate-50 text-[12px] text-ink-muted">
                <tr>
                  <th scope="col" className="px-4 py-2.5 text-left font-semibold">
                    묶음
                  </th>
                  <th scope="col" className="whitespace-nowrap px-2 py-2.5 text-right font-semibold">
                    장수
                  </th>
                  <th scope="col" className="whitespace-nowrap px-2 py-2.5 text-right font-semibold">
                    등록
                  </th>
                  <th scope="col" className="whitespace-nowrap py-2.5 pl-2 pr-4 text-right font-semibold sm:text-left">
                    등록률
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {batches.map((b) => {
                  const r = ratio(b.claimed, b.quantity);
                  return (
                    <tr key={b.id}>
                      {/* max-w-0 + w-full: 남는 폭을 모두 쓰고, 긴 이름은 말줄임 */}
                      <td className="w-full max-w-0 px-4">
                        <Link href={`/admin/stickers/${b.id}`} className="group flex min-h-12 flex-col justify-center py-2">
                          <span className="truncate font-semibold text-brand-700 group-hover:underline">{b.label}</span>
                          <span className="text-[12px] text-ink-muted tabular-nums">{b.created_at ? formatDate(b.created_at) : ""}</span>
                        </Link>
                        {/* 좁은 화면: 막대를 이름 아래에 길게 (오른쪽 칸에는 퍼센트만 두어 이름 자리를 넓혀요) */}
                        <RateBar ratio={r} label={`${b.label} 등록률 ${formatPercent(r)}`} className="mb-2.5 sm:hidden" />
                      </td>
                      <td className="whitespace-nowrap px-2 text-right tabular-nums">{formatCount(b.quantity)}</td>
                      <td className="whitespace-nowrap px-2 text-right tabular-nums">{formatCount(b.claimed)}</td>
                      <td className="py-2 pl-2 pr-4">
                        <div className="flex items-center justify-end gap-2 sm:justify-start">
                          <RateBar ratio={r} label={`${b.label} 등록률 ${formatPercent(r)}`} className="hidden w-24 flex-none sm:block" />
                          <span className={cn("min-w-10 text-right text-[12px] font-semibold tabular-nums", RATE_TEXT[rateTone(r)])}>
                            {formatPercent(r)}
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {batches.length >= BATCH_LIMIT && (
            <p className="border-t border-line px-4 py-2.5 text-[12px] text-ink-muted">최근 {BATCH_LIMIT}묶음만 보여요. 더 예전 묶음은 스티커 관리에서 볼 수 있어요.</p>
          )}
        </Card>
      )}
    </section>
  );
}
