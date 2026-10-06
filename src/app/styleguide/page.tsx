"use client";

import { useState } from "react";
import { CircleCheck, Clock, Plus, Save, TriangleAlert } from "lucide-react";
import {
  Button,
  Card,
  CardTitle,
  EmptyState,
  ErrorState,
  Input,
  Loading,
  Modal,
  Badge,
  Textarea,
  useToast,
} from "@/components/ui";

/**
 * 개발용 디자인 확인 페이지. 공통 UI 부품이 모바일에서 어떻게 보이는지 한 번에 확인합니다.
 * (서비스 메뉴에는 연결하지 않음)
 */
export default function StyleguidePage() {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const fakeSave = () => {
    setSaving(true);
    setTimeout(() => {
      setSaving(false);
      toast.success("저장되었습니다!");
    }, 1200);
  };

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-extrabold tracking-tight">디자인 확인</h1>

      <section className="space-y-3">
        <CardTitle>배지</CardTitle>
        <div className="flex flex-wrap gap-2">
          <Badge>기본</Badge>
          <Badge tone="brand">안내</Badge>
          <Badge tone="success" icon={<CircleCheck className="h-3.5 w-3.5" />}>완료</Badge>
          <Badge tone="warning" icon={<Clock className="h-3.5 w-3.5" />}>대기</Badge>
          <Badge tone="danger" icon={<TriangleAlert className="h-3.5 w-3.5" />}>주의</Badge>
        </div>
      </section>

      <section className="space-y-3">
        <CardTitle>버튼</CardTitle>
        <div className="grid gap-2 sm:grid-cols-2">
          <Button icon={<Plus className="h-4 w-4" />}>새로 만들기</Button>
          <Button variant="secondary" icon={<Save className="h-4 w-4" />}>
            저장
          </Button>
          <Button variant="danger">삭제</Button>
          <Button variant="ghost">취소</Button>
          <Button loading={saving} loadingText="저장 중..." onClick={fakeSave}>
            로딩 상태 시험
          </Button>
          <Button variant="secondary" onClick={() => setOpen(true)}>
            모달 열기
          </Button>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          <Button variant="secondary" onClick={() => toast.success("저장되었습니다!")}>
            성공 알림
          </Button>
          <Button variant="secondary" onClick={() => toast.error("저장에 실패했습니다.")}>
            실패 알림
          </Button>
          <Button variant="secondary" onClick={() => toast.info("인터넷 연결을 확인해주세요.")}>
            안내 알림
          </Button>
        </div>
      </section>

      <section className="space-y-3">
        <CardTitle>카드 · 입력</CardTitle>
        <Card className="space-y-4">
          <Input label="이름" placeholder="이름을 입력해 주세요" required />
          <Input label="이메일" type="email" placeholder="you@example.com" error="이메일 형식이 올바르지 않아요." />
          <Textarea
            label="설명"
            placeholder="자세한 내용을 적어 주세요."
            hint="도움말은 입력칸 아래에 이렇게 보여요."
          />
        </Card>
      </section>

      <section className="space-y-3">
        <CardTitle>로딩 · 빈 화면 · 오류</CardTitle>
        <Card>
          <Loading />
        </Card>
        <EmptyState
          title="아직 항목이 없습니다."
          description="첫 항목을 만들면 여기에 보여요."
          action={<Button full icon={<Plus className="h-4 w-4" />}>새로 만들기</Button>}
        />
        <ErrorState title="불러오지 못했어요" description="인터넷 연결을 확인하고 다시 시도해 주세요." />
      </section>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="정말 삭제할까요?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              취소
            </Button>
            <Button variant="danger" onClick={() => setOpen(false)}>
              삭제
            </Button>
          </>
        }
      >
        삭제하면 되돌릴 수 없어요. 확인 창은 모바일에서는 아래에서 올라오고, 넓은 화면에서는 가운데에 떠요.
      </Modal>
    </div>
  );
}
