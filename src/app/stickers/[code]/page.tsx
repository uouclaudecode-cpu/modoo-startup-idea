import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ButtonLink, ErrorState } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { ClaimStickerForm, type ClaimVehicle } from "./ClaimStickerForm";

export const metadata: Metadata = { title: "받은 스티커 연결", robots: { index: false } };

/** 새 스티커를 내 이동수단에 등록 */
export default async function ClaimStickerPage({ params }: { params: Promise<{ code: string }> }) {
  const { code: raw } = await params;
  const code = decodeURIComponent(raw);
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(code)) {
    return <ErrorState title="B-LOCK 스티커가 아니에요" description="QR이 훼손됐거나 잘못된 주소일 수 있어요. QR을 다시 찍어 주세요." />;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/stickers/${code}`)}`);

  const [{ data: status, error: statusErr }, { data: vehicles, error: vErr }] = await Promise.all([
    supabase.rpc("get_sticker_status", { p_code: code }),
    supabase.from("vehicles").select("id, type, name, image_path, sticker_spot").is("deleted_at", null).order("created_at", { ascending: false }),
  ]);
  if (statusErr || vErr) {
    console.error(statusErr ?? vErr);
    return <ErrorState title="인터넷 연결을 확인해 주세요" description="스티커 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요." />;
  }
  if (status === "claimed") {
    return (
      <ErrorState
        title="이미 등록된 스티커예요"
        description="다른 이동수단에 등록된 스티커는 다시 등록할 수 없어요. 새 스티커를 받아 주세요."
        action={
          <ButtonLink href="/" full>
            내 이동수단
          </ButtonLink>
        }
      />
    );
  }
  if (status !== "unclaimed") {
    return <ErrorState title="B-LOCK 스티커가 아니에요" description="QR이 훼손됐거나 잘못된 주소일 수 있어요. QR을 다시 찍어 주세요." />;
  }

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">받은 스티커 연결</h1>
        <p className="mt-1 text-sm leading-relaxed text-ink-muted">
          이 스티커를 붙일 이동수단을 골라 주세요. 등록한 뒤 스티커를 찍으면 그 이동수단의 신분증이 열려요.
        </p>
      </div>
      <ClaimStickerForm code={code} vehicles={(vehicles ?? []) as ClaimVehicle[]} />
    </div>
  );
}
