import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Bike, ChevronRight, Plus, Printer } from "lucide-react";
import { ButtonLink, Card, EmptyState } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { typeEmoji, type VehicleType } from "@/lib/types";

export const metadata: Metadata = { title: "QR 출력하기" };

/** 출력 바로가기: 이동수단이 하나면 바로 출력 화면, 여러 개면 고르기, 없으면 등록부터 */
export default async function PrintEntryPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/print");

  const { data, error } = await supabase.from("vehicles").select("id, name, type").is("deleted_at", null).order("created_at", { ascending: true });
  if (error) console.error(error);
  const list = (data ?? []) as { id: string; name: string; type: VehicleType }[];
  if (list.length === 1) redirect(`/vehicles/${list[0].id}/qr/print`);

  return (
    <div className="mx-auto max-w-md space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight">
          <Printer aria-hidden className="h-6 w-6 text-brand-600" />
          QR 출력하기
        </h1>
        <p className="mt-1 text-[15px] leading-relaxed text-ink-muted">QR은 이동수단마다 달라요. 어떤 이동수단의 QR을 출력할까요?</p>
      </div>
      {list.length === 0 ? (
        <EmptyState
          icon={<Bike className="h-7 w-7" />}
          title="먼저 이동수단을 등록해 주세요"
          description="등록하면 QR 신분증이 만들어지고, 원하는 크기로 출력할 수 있어요."
          action={
            <ButtonLink href="/vehicles/new" full icon={<Plus aria-hidden className="h-4 w-4" />}>
              이동수단 등록
            </ButtonLink>
          }
        />
      ) : (
        <ul className="space-y-2">
          {list.map((v) => (
            <li key={v.id}>
              <Link href={`/vehicles/${v.id}/qr/print`} className="block">
                <Card className="flex items-center gap-3 p-4 hover:shadow-lift">
                  <span aria-hidden className="grid h-11 w-11 flex-none place-items-center rounded-xl bg-brand-50 text-xl">
                    {typeEmoji(v.type)}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-bold">{v.name}</span>
                  <ChevronRight aria-hidden className="h-5 w-5 flex-none text-ink-faint" />
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
