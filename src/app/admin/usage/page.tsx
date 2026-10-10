import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ExternalLink } from "lucide-react";
import { Card, ErrorState } from "@/components/ui";
import { requireAdmin } from "@/lib/admin";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "서비스 사용량", robots: { index: false } };

type Api = { today: number; month: number; max_day: number };
type Stats = {
  db_bytes: number;
  storage: { bucket: string; bytes: number; files: number }[];
  storage_bytes: number;
  mau: number;
  users: number;
  api: Partial<Record<"naver_map" | "kakao_search" | "osm_search" | "routing" | "data_go_kr", Api>>;
};

const MB = 1024 * 1024;
const fmtBytes = (b: number) => (b >= 1024 * MB ? `${(b / 1024 / MB).toFixed(2)}GB` : `${(b / MB).toFixed(b < 10 * MB ? 1 : 0)}MB`);
const fmtNum = (n: number) => n.toLocaleString("ko-KR");

const BUCKET_NAME: Record<string, string> = {
  "vehicle-images": "이동수단·프로필 사진",
  "community-images": "커뮤니티 사진",
  "community-secret": "비밀 댓글 사진",
  "report-images": "발견 제보 사진",
  "sighting-images": "목격 제보 사진",
  evidence: "증거 보관함",
};


/** 관리자 전용: 서비스별 무료 한도와 지금 사용량 */
export default async function AdminUsagePage() {
  const { supabase } = await requireAdmin("/admin/usage");
  const { data, error } = await supabase.rpc("admin_usage_stats");
  if (error || !data) {
    if (error) console.error(error);
    return <ErrorState title="사용량을 불러오지 못했어요" description="Supabase에서 036_usage.sql을 실행했는지 확인해 주세요." />;
  }
  const s = data as Stats;
  const api = (k: keyof Stats["api"]): Api => s.api[k] ?? { today: 0, month: 0, max_day: 0 };

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <Link href="/admin" className="-ml-2 inline-flex h-10 items-center gap-1 rounded-lg px-2 text-sm font-semibold text-ink-muted hover:bg-slate-100 hover:text-ink">
        <ChevronLeft aria-hidden className="h-4 w-4" />
        운영 통계
      </Link>
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">서비스 사용량</h1>
        <p className="mt-1 text-sm leading-relaxed text-ink-muted">
          B-LOCK이 쓰는 바깥 서비스마다 무료 한도의 몇 %를 쓰고 있는지 보여 줘요. 80%를 넘으면 매일 아침 9시에 관리자 휴대폰으로 알려 드려요. 호출 수는 036 설정을 실행한 날부터 세요.
        </p>
      </div>

      <ServiceCard name="Supabase" role="회원·데이터·사진 저장" link="https://supabase.com/dashboard/org/_/usage" linkLabel="Supabase 사용량 화면">
        <Meter label="데이터베이스 용량" used={s.db_bytes} limit={500 * MB} show={fmtBytes} />
        <Meter label="사진 저장 용량" used={s.storage_bytes} limit={1024 * MB} show={fmtBytes} />
        {s.storage.length > 0 && (
          <ul className="space-y-0.5 pl-1 text-[12px] text-ink-muted">
            {s.storage.map((b) => (
              <li key={b.bucket}>
                · {BUCKET_NAME[b.bucket] ?? b.bucket}: {fmtBytes(b.bytes)} ({fmtNum(b.files)}개)
              </li>
            ))}
          </ul>
        )}
        <Meter label="한 달 접속 회원" used={s.mau} limit={50000} show={fmtNum} note={`전체 회원 ${fmtNum(s.users)}명`} />
        <Note>
          전송량(무료 월 5GB)은 여기서 셀 수 없어서 Supabase 화면에서 확인해 주세요. 무료 요금제는 자동 백업이 없어요. 정식 출시 때는 Pro(월 $25)를 권해요.
        </Note>
      </ServiceCard>

      <ServiceCard name="Vercel" role="사이트 서버" link="https://vercel.com/uouclaudecode-cpu/~/usage" linkLabel="Vercel 사용량 화면">
        <Note>
          사용량은 Vercel 화면에서 확인해 주세요. 무료(Hobby) 요금제는 개인·비영리용이에요. 광고·유료 기능·제휴 수익이 생기면 Pro(월 $20)로 바꿔야 해요.
        </Note>
      </ServiceCard>

      <ServiceCard name="네이버 지도" role="지도 보여 주기" link="https://console.ncloud.com/" linkLabel="네이버 클라우드 콘솔">
        <Meter label="오늘 지도 불러온 수" used={api("naver_map").today} limit={6_000_000} show={fmtNum} note={`이번 달 ${fmtNum(api("naver_map").month)}번`} />
      </ServiceCard>

      <ServiceCard name="카카오 장소 검색" role="길 안내 도착지 찾기" link="https://developers.kakao.com/console/app" linkLabel="카카오 개발자 콘솔">
        <Count label="오늘" value={api("kakao_search").today} />
        <Count label="이번 달" value={api("kakao_search").month} />
        <Note>
          무료 한도는 카카오 콘솔의 &lsquo;쿼터&rsquo;에서 확인해 주세요. 넘으면 1건에 2원이에요. 이번 달이 모두 유료라고 해도 최대 약 {fmtNum(api("kakao_search").month * 2)}원이에요.
        </Note>
      </ServiceCard>

      <ServiceCard name="자전거 길찾기 (공개 서버)" role="길 안내 경로" link="https://routing.openstreetmap.de/" linkLabel="서버 안내">
        <Count label="오늘" value={api("routing").today} />
        <Count label="이번 달" value={api("routing").month} />
        <Count label="이번 달 가장 많았던 날" value={api("routing").max_day} />
        <Note>
          키 없이 쓰는 공개 서버라 정해진 한도는 없지만, 하루 1,000번을 넘기 시작하면 자체 길찾기 서버(월 2~5만 원)로 옮기는 게 안전해요. 카카오 검색이 안 될 때 쓰는 무료 검색은 이번 달 {fmtNum(api("osm_search").month)}번 썼어요.
        </Note>
      </ServiceCard>

      <ServiceCard name="공공데이터포털" role="보관소·공기주입기·사고 잦은 곳" link="https://www.data.go.kr/" linkLabel="공공데이터포털">
        <Meter label="오늘 부른 수" used={api("data_go_kr").today} limit={10000} show={fmtNum} note={`이번 달 ${fmtNum(api("data_go_kr").month)}번 · 매달 자동 갱신 때 약 950번`} />
        <Note>개발 계정은 데이터마다 하루 10,000번까지예요. 한 달에 한 번만 불러와서 넉넉해요.</Note>
      </ServiceCard>
    </div>
  );
}

function ServiceCard({ name, role, link, linkLabel, children }: { name: string; role: string; link: string; linkLabel: string; children: React.ReactNode }) {
  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="font-bold">{name}</h2>
          <p className="text-[13px] text-ink-muted">{role}</p>
        </div>
        <a href={link} target="_blank" rel="noreferrer" className="inline-flex flex-none items-center gap-1 text-[13px] font-semibold text-brand-700 hover:underline">
          {linkLabel}
          <ExternalLink aria-hidden className="h-3.5 w-3.5" />
        </a>
      </div>
      {children}
    </Card>
  );
}

/** 무료 한도 대비 막대 (70% 주황, 90% 빨강) */
function Meter({ label, used, limit, show, note }: { label: string; used: number; limit: number; show: (n: number) => string; note?: string }) {
  const pct = Math.min(100, (used / limit) * 100);
  const tone = pct >= 90 ? "bg-rose-500" : pct >= 70 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-semibold text-ink-soft">{label}</span>
        <span className="tabular-nums">
          <b className={cn(pct >= 90 ? "text-rose-600" : pct >= 70 ? "text-amber-600" : "text-ink")}>{pct < 1 && used > 0 ? "1% 미만" : `${Math.round(pct)}%`}</b>
          <span className="text-[12px] text-ink-muted">
            {" "}
            · {show(used)} / {show(limit)}
          </span>
        </span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-slate-100" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} aria-label={label}>
        <div className={cn("h-full rounded-full", tone)} style={{ width: `${Math.max(pct, used > 0 ? 1 : 0)}%` }} />
      </div>
      {note && <p className="text-[12px] text-ink-muted">{note}</p>}
    </div>
  );
}

function Count({ label, value }: { label: string; value: number }) {
  return (
    <p className="flex items-baseline justify-between text-sm">
      <span className="font-semibold text-ink-soft">{label}</span>
      <b className="tabular-nums">{fmtNum(value)}번</b>
    </p>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg bg-slate-50 p-2.5 text-[12px] leading-relaxed text-ink-muted">{children}</p>;
}
