# 인증 메일 설정 (Supabase)

B-LOCK이 보내는 메일은 **비밀번호 재설정** 하나예요. (가입 확인 메일은 꺼 둠)

## 1. 메일 서버 연결 (출시 전 필수)

Supabase 기본 메일 서버는 **프로젝트 팀원 이메일로만** 보내고, 시간당 2통까지만 보내요.
그래서 직접 SMTP를 연결하지 않으면 일반 사용자는 비밀번호 재설정 메일을 받을 수 없어요.

도메인이 없을 때 가장 쉬운 방법은 Gmail SMTP예요. (하루 약 500통)

1. Google 계정에 2단계 인증을 켜요: https://myaccount.google.com/signinoptions/twosv
2. 앱 비밀번호를 만들어요(이름: B-LOCK): https://myaccount.google.com/apppasswords → 16자리 비밀번호 복사
3. Supabase → Authentication → Emails → SMTP Settings: https://supabase.com/dashboard/project/ilvmcjwxsvowrcclkion/auth/smtp
   - Enable custom SMTP 켜기
   - Sender email: 그 Gmail 주소 / Sender name: `B-LOCK`
   - Host: `smtp.gmail.com` / Port: `465`
   - Username: 그 Gmail 주소 / Password: 2에서 복사한 16자리 (띄어쓰기 없이)
   - Save
4. Authentication → Rate Limits에서 "Rate limit for sending emails"를 시간당 30 정도로 두기 (기본값)

> Resend 같은 메일 서비스는 내 도메인을 인증해야 다른 사람에게 보낼 수 있어요. 도메인을 사면 그때 바꾸면 돼요.

## 2. 비밀번호 재설정 메일을 한국어로 (SMTP 연결 후 수정 가능)

Supabase → Authentication → Emails → Templates → **Reset Password**
https://supabase.com/dashboard/project/ilvmcjwxsvowrcclkion/auth/templates

**Subject**

```
[B-LOCK] 비밀번호 재설정 안내
```

**Message (HTML)**

```html
<div style="max-width:480px;margin:0 auto;padding:24px;font-family:-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo','Malgun Gothic',sans-serif;color:#0f172a;line-height:1.6">
  <p style="font-size:20px;font-weight:800;margin:0 0 16px">B-LOCK</p>
  <p style="margin:0 0 12px">비밀번호를 다시 정하려면 아래 버튼을 눌러 주세요.</p>
  <p style="margin:0 0 20px;font-size:14px;color:#475569">
    <b>요청한 것과 같은 휴대폰·브라우저</b>에서 열어 주세요. 링크는 1시간 동안만 쓸 수 있어요.
  </p>
  <p style="margin:0 0 24px">
    <a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#2552e8;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:12px">비밀번호 다시 정하기</a>
  </p>
  <p style="margin:0;font-size:13px;color:#64748b">직접 요청하지 않았다면 이 메일은 무시해도 돼요. 비밀번호는 바뀌지 않아요.</p>
</div>
```
