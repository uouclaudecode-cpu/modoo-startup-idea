import { ArrowRight, Lightbulb, Rocket, ShieldCheck, Users, Zap } from "lucide-react";
import { site } from "@/config/site";
import { ButtonLink, Card } from "@/components/ui";

/*
 * 기본 홈 화면 틀입니다. 아이디어가 정해지면 아래 FEATURES·STEPS 문구와
 * src/config/site.ts 의 이름·소개만 바꾸면 됩니다.
 */
const FEATURES = [
  { icon: Zap, title: "핵심 기능 1", text: "서비스의 첫 번째 핵심 기능을 한두 줄로 설명해요." },
  { icon: ShieldCheck, title: "핵심 기능 2", text: "사용자가 얻는 두 번째 이점을 적어요." },
  { icon: Users, title: "핵심 기능 3", text: "누가, 언제 이 기능을 쓰는지 적어요." },
];

const STEPS = [
  { title: "가입하기", text: "몇 초 만에 시작할 수 있어요." },
  { title: "정보 입력하기", text: "필요한 정보를 간단히 입력해요." },
  { title: "결과 확인하기", text: "서비스가 주는 결과를 바로 확인해요." },
];

export default function HomePage() {
  return (
    <div className="space-y-12">
      {/* 첫 화면 */}
      <section id="start" className="scroll-mt-20 rounded-3xl bg-gradient-to-br from-brand-600 to-brand-800 px-6 py-10 text-white shadow-lift">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-[13px] font-semibold">
          <Lightbulb aria-hidden className="h-4 w-4" />
          준비 중인 서비스
        </span>
        <h1 className="mt-4 text-[28px] font-extrabold leading-tight tracking-tight sm:text-4xl">{site.name}</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-brand-50/90">{site.tagline}</p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <ButtonLink
            href="/#features"
            size="lg"
            full
            variant="light"
            icon={<Rocket aria-hidden className="h-5 w-5" />}
          >
            기능 살펴보기
          </ButtonLink>
          <ButtonLink
            href="/#how"
            size="lg"
            full
            variant="glass"
          >
            이용 방법
            <ArrowRight aria-hidden className="h-5 w-5" />
          </ButtonLink>
        </div>
      </section>

      {/* 핵심 기능 */}
      <section id="features" className="scroll-mt-20">
        <h2 className="text-xl font-bold tracking-tight">핵심 기능</h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-3">
          {FEATURES.map((f) => (
            <li key={f.title}>
              <Card className="h-full p-4">
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-50 text-brand-600">
                  <f.icon aria-hidden className="h-5 w-5" />
                </span>
                <p className="mt-3 font-bold">{f.title}</p>
                <p className="mt-1 text-sm leading-relaxed text-ink-muted">{f.text}</p>
              </Card>
            </li>
          ))}
        </ul>
      </section>

      {/* 이용 방법 */}
      <section id="how" className="scroll-mt-20">
        <h2 className="text-xl font-bold tracking-tight">이용 방법</h2>
        <ol className="mt-4 space-y-3">
          {STEPS.map((s, i) => (
            <li key={s.title}>
              <Card className="flex items-center gap-4 p-4">
                <span className="grid h-10 w-10 flex-none place-items-center rounded-full bg-brand-600 text-sm font-bold text-white">
                  {i + 1}
                </span>
                <div>
                  <p className="font-bold">{s.title}</p>
                  <p className="text-sm text-ink-muted">{s.text}</p>
                </div>
              </Card>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
