/** 지도 API가 아닌 무료 링크: 카카오맵 앱/웹에서 위치를 보여줍니다. (API 키 필요 없음) */
export function kakaoMapLink(lat: number, lng: number, label = "발견 위치") {
  return `https://map.kakao.com/link/map/${encodeURIComponent(label)},${lat},${lng}`;
}
