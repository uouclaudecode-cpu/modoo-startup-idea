import { SkeletonPanel, SkeletonScreen } from "@/components/ui";

export default function Loading() {
  return (
    <SkeletonScreen className="mx-auto max-w-xl space-y-4">
      <SkeletonPanel />
      <SkeletonPanel />
    </SkeletonScreen>
  );
}
