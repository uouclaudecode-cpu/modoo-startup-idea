/**
 * 화면을 옮길 때마다 새로 그려지는 틀. 새 화면이 살짝 떠오르며 부드럽게 나타나요.
 * (불러오는 동안의 회색 자리 → 실제 화면으로 바뀔 때도 툭 바뀌지 않게)
 * 움직임 줄이기 설정을 켠 사람에게는 바로 보여요.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="animate-page-in motion-reduce:animate-none">{children}</div>;
}
