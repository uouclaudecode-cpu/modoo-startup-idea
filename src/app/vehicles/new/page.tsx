import type { Metadata } from "next";
import { NewVehicleForm } from "./NewVehicleForm";

export const metadata: Metadata = { title: "이동수단 등록" };

export default function NewVehiclePage() {
  return (
    <div className="mx-auto max-w-xl space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">이동수단 등록</h1>
        <p className="mt-1 text-sm text-ink-muted">등록을 마치면 이 이동수단만의 고유 QR이 자동으로 만들어져요.</p>
      </div>
      <NewVehicleForm />
    </div>
  );
}
