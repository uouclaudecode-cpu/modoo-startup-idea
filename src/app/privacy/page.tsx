import type { Metadata } from "next";
import { site } from "@/config/site";
import { Bullets, Clause, ContactLine, LegalPage } from "@/components/legal/LegalPage";

export const metadata: Metadata = { title: "개인정보처리방침" };

const ROWS: [string, string, string][] = [
  ["회원 가입·로그인", "이메일, 비밀번호(암호화 저장), 닉네임", "탈퇴할 때까지"],
  ["이동수단 등록", "종류·이름·브랜드·모델·색상·특징, 사진, QR 코드, 스티커 부착 위치(본인만 보기)", "탈퇴하거나 삭제할 때까지"],
  ["발견 제보 (로그인 없이 가능)", "제보 내용, 발견 위치(선택: 현재 위치 또는 직접 입력), 사진(선택), 연락처(선택)", "제보받은 이동수단이 삭제되거나 주인이 탈퇴할 때까지"],
  ["분실 커뮤니티", "글·댓글 내용, 사진, 잃어버린 곳·본 위치(선택), 신고·차단 기록", "삭제하거나 탈퇴할 때까지"],
  ["라이딩 기록·정비 다이어리", "라이딩 경로(GPS 위치), 시간·거리·속도, 정비 날짜·비용·정비소·메모", "삭제하거나 탈퇴할 때까지"],
  ["푸시 알림 (켠 경우)", "알림 받는 기기의 구독 정보(브라우저가 만든 주소·키), 알림 설정", "알림을 끄거나 탈퇴할 때까지"],
  ["서비스 이용 중 자동 생성", "접속 기록, 오류 기록, 브라우저 저장소(로그인 유지, 진행 중인 라이딩)", "보안·오류 확인에 필요한 기간"],
];

export default function PrivacyPage() {
  return (
    <LegalPage title="개인정보처리방침">
      <p>
        {site.operator}(이하 &lsquo;운영자&rsquo;)는 {site.name} 서비스를 제공하면서 필요한 최소한의 개인정보만 처리하고, 개인정보 보호법 등 관련 법령을
        지킵니다.
      </p>
      <Clause n={1} title="처리하는 개인정보와 목적·보유 기간">
        <div className="-mx-1 overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-left text-[14px]">
            <thead>
              <tr className="border-b border-line text-ink">
                <th className="px-1 py-2 font-bold">목적</th>
                <th className="px-1 py-2 font-bold">항목</th>
                <th className="px-1 py-2 font-bold">보유 기간</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map(([a, b, c]) => (
                <tr key={a} className="border-b border-line/70 align-top">
                  <td className="px-1 py-2 font-semibold text-ink">{a}</td>
                  <td className="px-1 py-2">{b}</td>
                  <td className="px-1 py-2">{c}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>법령에 따라 보관해야 하는 경우에는 그 기간 동안 따로 보관해요.</p>
      </Clause>
      <Clause n={2} title="공개되는 정보">
        <Bullets
          items={[
            "QR을 스캔한 사람에게는 이동수단의 종류·색상·브랜드·모델·특징·사진과 상태만 보여요. 이름·이메일·닉네임·전화번호는 공개하지 않아요.",
            "커뮤니티 글·공개 댓글과 닉네임은 누구나 볼 수 있어요. 비밀 댓글·답글은 쓴 사람과 글쓴이(답글이면 원래 댓글 쓴 사람)만 볼 수 있어요.",
            "발견 제보의 위치·사진·연락처는 그 이동수단의 주인만 볼 수 있어요.",
          ]}
        />
      </Clause>
      <Clause n={3} title="제3자 제공">
        <p>회원의 동의 없이 개인정보를 제3자에게 제공하지 않아요. 다만 법령에 따라 수사기관이 적법한 절차로 요청하면 제공할 수 있어요.</p>
      </Clause>
      <Clause n={4} title="처리 위탁 및 국외 이전">
        <Bullets
          items={[
            "Supabase Inc. — 회원·데이터베이스·사진 저장 (저장 위치: 대한민국 서울 리전)",
            "Vercel Inc. — 웹사이트 운영(호스팅), 푸시 알림 발송 처리 (미국 등, 서비스 이용 시 네트워크로 이전)",
            "NAVER Cloud — 지도 표시 (지도를 볼 때 화면 위치 정보가 지도 서버로 전달될 수 있어요)",
            "브라우저 푸시 서비스(Google, Apple, Mozilla 등) — 알림 전달 (알림을 켠 경우)",
          ]}
        />
        <p>국외 이전을 원하지 않으면 서비스 이용을 멈추고 탈퇴할 수 있어요. 탈퇴하면 위탁 업체에 저장된 정보도 함께 지워져요.</p>
      </Clause>
      <Clause n={5} title="파기">
        <p>보유 기간이 끝나거나 탈퇴하면 지체 없이 지워요. 전자 파일은 복구할 수 없는 방법으로 지워요.</p>
      </Clause>
      <Clause n={6} title="회원의 권리">
        <Bullets
          items={[
            "내 정보 보기·고치기: 내 이동수단·설정 화면에서 직접 할 수 있어요.",
            "삭제·탈퇴: 이동수단·글·기록은 각 화면에서, 계정은 설정 → 회원 탈퇴에서 지울 수 있어요.",
            "처리 정지·그 밖의 요청은 아래 연락처로 보내 주세요. 지체 없이 처리해요.",
          ]}
        />
      </Clause>
      <Clause n={7} title="안전성 확보 조치">
        <Bullets
          items={[
            "비밀번호는 암호화해서 저장하고, 모든 통신은 암호화(HTTPS)해요.",
            "데이터베이스 행 단위 권한(RLS)으로 본인 정보만 볼 수 있게 막아요.",
            "QR에는 개인정보 없이 예측할 수 없는 무작위 코드만 들어가요.",
          ]}
        />
      </Clause>
      <Clause n={8} title="위치정보">
        <p>위치정보는 회원이 직접 버튼을 누르거나 라이딩을 시작했을 때만 브라우저 권한으로 받아요. 자세한 내용은 위치정보 이용약관을 확인해 주세요.</p>
      </Clause>
      <Clause n={9} title="만 14세 미만 아동">
        <p>만 14세 미만은 회원으로 가입할 수 없어요.</p>
      </Clause>
      <Clause n={10} title="개인정보 보호책임자와 문의">
        <p>
          책임자: {site.operator} · 연락처: <ContactLine />
        </p>
        <p className="text-[14px]">
          개인정보 침해 신고·상담: 개인정보침해신고센터(국번 없이 118, privacy.kisa.or.kr), 개인정보분쟁조정위원회(1833-6972, kopico.go.kr)
        </p>
      </Clause>
    </LegalPage>
  );
}
