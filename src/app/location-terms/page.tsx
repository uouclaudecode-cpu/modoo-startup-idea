import type { Metadata } from "next";
import { site } from "@/config/site";
import { Bullets, Clause, ContactLine, LegalPage } from "@/components/legal/LegalPage";

export const metadata: Metadata = { title: "위치정보 이용약관" };

export default function LocationTermsPage() {
  return (
    <LegalPage title="위치정보 이용약관">
      <Clause n={1} title="목적">
        <p>
          이 약관은 {site.operator}가 제공하는 {site.name} 서비스에서 위치정보를 이용하는 조건과 절차, 회원의 권리를 정합니다.
        </p>
      </Clause>
      <Clause n={2} title="위치정보를 이용하는 기능">
        <Bullets
          items={[
            "발견 제보: QR을 스캔한 사람이 '현재 위치 가져오기'를 누르면, 그때 한 번의 위치를 이동수단 주인에게 전달해요.",
            "커뮤니티: 분실 글의 잃어버린 곳, 댓글의 본 위치를 지도에 표시해요. (회원이 지도에서 고르거나 현재 위치 버튼을 누른 경우)",
            "라이딩 기록: 라이딩을 시작한 동안 이동 경로를 기록해 거리·속도를 계산하고, 저장하면 본인만 볼 수 있어요.",
          ]}
        />
        <p>
          서비스는 회원이 버튼을 누르거나 라이딩을 기록하는 동안에만 위치를 받아요. 이동수단이나 사람의 위치를 몰래 또는 실시간으로 추적하지 않아요.
        </p>
      </Clause>
      <Clause n={3} title="동의와 철회">
        <Bullets
          items={[
            "위치는 브라우저(또는 앱)의 위치 권한을 허용한 경우에만 받아요. 권한은 기기 설정에서 언제든 끌 수 있어요.",
            "권한을 끄면 위치를 직접 입력해서 제보·글쓰기를 할 수 있어요. 라이딩 기록은 위치 권한이 있어야 해요.",
          ]}
        />
      </Clause>
      <Clause n={4} title="보유 기간과 파기">
        <p>
          저장된 위치(제보 위치, 글·댓글 위치, 라이딩 경로)는 해당 기록을 지우거나 탈퇴할 때 함께 지워요. 위치정보 이용·제공 사실 확인 자료는 관련 법령에서
          정한 기간 동안 보관할 수 있어요.
        </p>
      </Clause>
      <Clause n={5} title="제3자 제공">
        <p>
          발견 제보의 위치는 그 이동수단의 주인에게만 전달돼요. 그 밖에는 회원의 동의 없이 위치정보를 제3자에게 제공하지 않아요. 단, 법령에 따른 요청은
          예외예요.
        </p>
      </Clause>
      <Clause n={6} title="만 14세 미만">
        <p>만 14세 미만은 가입할 수 없으며, 위치정보를 이용하는 회원 기능을 쓸 수 없어요.</p>
      </Clause>
      <Clause n={7} title="위치정보관리책임자와 문의">
        <p>
          책임자: {site.operator} · 연락처: <ContactLine />
        </p>
      </Clause>
    </LegalPage>
  );
}
