import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { ErrorState } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { typeLabel, type PublicVehicle } from "@/lib/types";
import { BadQrActions } from "@/app/scan/[qrId]/BadQrActions";
import { ReportForm } from "./ReportForm";

const UNKNOWN_QR = "QR이 훼손됐거나 잘못된 주소일 수 있어요. 다시 찍어 보거나, QR 아래 조회 번호로 도난 여부를 확인해 보세요.";

export const metadata: Metadata = { title: "발견 제보", robots: { index: false } };

export default async function ReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ qrId: string }>;
  searchParams: Promise<{ kind?: string }>;
}) {
  const { qrId } = await params;
  const { kind } = await searchParams;
  const token = decodeURIComponent(qrId);
  const mode = kind === "contact" ? "contact" : "found";

  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) {
    return <ErrorState title="등록되지 않은 QR이에요" description={UNKNOWN_QR} action={<BadQrActions />} />;
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_public_vehicle", { p_token: token });
  if (error) {
    console.error(error);
    return (
      <ErrorState
        title="인터넷 연결을 확인해 주세요"
        description="이동수단 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요."
        action={<BadQrActions retryHref={`/report/${encodeURIComponent(token)}?kind=${mode}`} />}
      />
    );
  }
  const v = (data as PublicVehicle[] | null)?.[0];
  if (!v) return <ErrorState title="등록되지 않은 QR이에요" description={UNKNOWN_QR} action={<BadQrActions />} />;
  if (!v.available) {
    return <ErrorState title="지금은 쓸 수 없는 QR이에요" description="소유자가 이 이동수단의 등록을 해제했어요." action={<BadQrActions />} />;
  }

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <Link href={`/scan/${encodeURIComponent(token)}`} className="inline-flex items-center gap-1 text-sm font-semibold text-ink-muted hover:text-ink">
        <ChevronLeft aria-hidden className="h-4 w-4" />
        {typeLabel(v.type)} 정보로 돌아가기
      </Link>
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">{mode === "contact" ? "주인에게 연락하기" : "발견 제보하기"}</h1>
        <p className="mt-1 text-sm leading-relaxed text-ink-muted">
          {mode === "contact"
            ? "남긴 메시지는 주인에게만 전달돼요. 로그인하지 않아도 보낼 수 있어요."
            : "발견한 위치와 사진을 보내 주시면 주인에게만 전달돼요. 로그인하지 않아도 제보할 수 있어요."}
        </p>
      </div>
      <ReportForm token={token} mode={mode} vehicleLabel={[v.color, v.brand, typeLabel(v.type)].filter(Boolean).join(" ")} />
    </div>
  );
}
