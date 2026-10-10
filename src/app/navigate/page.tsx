import type { Metadata } from "next";
import { Navigator } from "./Navigator";

export const metadata: Metadata = {
  title: "자전거 길 안내",
  description: "자전거로 가기 좋은 길을 찾고, 꺾는 곳과 자전거 사고가 잦은 곳을 미리 알려 줘요.",
};

export default async function NavigatePage({ searchParams }: { searchParams: Promise<{ to?: string; name?: string }> }) {
  const { to, name } = await searchParams;
  const [lat, lng] = (to ?? "").split(",").map(Number);
  const dest = Number.isFinite(lat) && Number.isFinite(lng) && lat >= 33 && lat <= 39 && lng >= 124 && lng <= 132 ? { lat, lng, name: (name ?? "").slice(0, 40) || "고른 곳" } : null;
  return <Navigator initialDest={dest} />;
}
