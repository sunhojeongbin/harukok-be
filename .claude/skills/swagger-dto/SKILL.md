---
name: swagger-dto
description: 하루콕 백엔드(NestJS)에서 DTO 를 새로 만들거나 필드를 추가·변경·삭제할 때, 컨트롤러에 엔드포인트·경로 파라미터·응답 스키마를 붙일 때, Swagger(/docs) 문서의 설명·예시·검증 표시·스키마 이름을 고칠 때 반드시 사용한다. 새 API 구현, 요청/응답 형식 변경, "Swagger 에 설명이 없다", "예시가 string 으로 나온다", "DTO 이름 정리" 같은 요청이면 DTO 라는 말이 없어도 이 스킬을 따른다.
---

# Swagger DTO 작성 규칙 (하루콕)

앱 개발자가 Swagger 만 보고 값의 의미와 넣을 값을 알 수 있어야 한다. 이 프로젝트는 Swagger CLI 플러그인을 쓰지 않아서(CLAUDE.md 3장) **데코레이터에 직접 적은 것만 문서에 나온다.** class-validator 규칙도 자동으로 실리지 않는다.

전체 규칙과 근거는 `docs/guides/swagger-dto.md` 에 있다. 처음이거나 애매하면 그 문서를 읽는다. 아래는 작업할 때 바로 쓰는 요약이다.

## 작업 순서

1. **기존 패턴을 먼저 본다** — 같은 모듈의 `dto/*.ts`, `src/modules/auth/dto/swagger-docs.ts`(가짜 예시 · 공유 enum), `todo.dto.ts` 의 `TITLE_DOC` · `DATE_FORMAT`, 컨트롤러의 `TODO_ID_PARAM`. 새 구조를 만들지 않는다
2. **테스트부터 고친다** (CLAUDE.md 5장) — `test/swagger.e2e-spec.ts`
   - DTO 를 추가 · 삭제 · 이름 변경하면 **스키마 이름 목록** 테스트를 먼저 고친다
   - 요청 DTO 를 추가하면 "요청 DTO 의 문자열 필드에는 예시가 있다" 테스트의 목록에 넣는다
   - 실행해서 실패를 확인한다: `npx jest --config test/jest-e2e.json swagger`
3. DTO · 컨트롤러를 고친다 (아래 규칙)
4. 같은 swagger e2e 가 통과하는지 보고, `npm run verify` 로 마무리한다
5. 응답 형식이나 스키마 이름이 바뀌면 PR 본문에 **앱 쪽 영향**을 적는다 (앱이 Swagger 로 타입을 생성할 수 있다)

## 규칙 요약

**이름** — 요청 본문 `…RequestDto`, 응답 본문 `…ResponseDto`, 쿼리 `…QueryDto`. 한 클래스를 요청·응답·등록·수정에 섞어 쓰지 않는다. 파일 이름도 맞춘다 (`error-response.dto.ts`). 중첩 응답 객체는 부모 이름으로 드러나면 예외(`LoginUserDto`).

**설명** — 모든 필드 · 경로/쿼리 파라미터에 **한 줄**. "무엇인지 → 핵심 규칙" 순서. NULL 이 오면 뜻을, 시각이면 기준을 적는다.

```ts
@ApiProperty({
  type: String,
  format: 'date-time',
  nullable: true,
  description: '완료한 시각 (서버 시각). NULL 이면 미완료',
})
completedAt: string | null;
```

공용 설정에는 규칙(길이 · 형식 · 예시)만 두고 설명은 필드마다 쓴다 — 공용 설명을 쓰면 `date` · `dueDate` · `startDate` 가 같은 문장이 되어 구분이 안 된다. 경로 파라미터는 `@ApiParam` (예: `@ApiParam(TODO_ID_PARAM)`).

**예시** — 요청 DTO 의 문자열 필드는 전부, 응답의 자유 텍스트 · 토큰도. enum · boolean · uuid · date-time 은 UI 가 채우니 생략 가능. **가짜 값만** — 실제 토큰 · 이메일 · 클라이언트 ID 를 넣지 않는다. 인증 관련 예시는 `swagger-docs.ts` 의 `EXAMPLE` 을 쓰거나 거기에 추가한다. 배열 응답에 여러 개를 보이려면 `@ApiOkResponse({ type: [Dto], example: [...] })`.

**검증 규칙을 문서에도** — 검증과 문서가 따로 놀지 않게 같은 값을 두 번 적는다.

| 검증                                  | `@ApiProperty` 에                       |
| ------------------------------------- | --------------------------------------- |
| `@MaxLength(n)` · `@TextLength(a, b)` | `maxLength` · `minLength`               |
| `@IsDateOnly()`                       | `...DATE_FORMAT` (`format: 'date'`)     |
| `@IsOptional()`                       | `@ApiPropertyOptional` 로 (짝을 맞춘다) |
| `@ValidateIf(...)`                    | `@ApiPropertyOptional` + 설명에 조건    |
| `@Matches(...)` 같은 형식 제약        | 설명에 한 마디                          |

**노출 금지** — 엔티티를 그대로 반환하지 않는다. 전용 응답 DTO + 매퍼/UseCase 에서 필요한 필드만 담는다. 토큰 해시 · 암호문 · `user_id` · `deleted_at` 같은 내부 값은 DTO 에 두지 않는다.

**중첩 · enum** — 중첩 객체는 별도 DTO + `type: 하위Dto` (배열은 `[하위Dto]`). 여러 DTO 가 같은 enum 을 쓰면 `enumName` 으로 공유한다 — 소셜 제공자는 `...SOCIAL_PROVIDER_SCHEMA`.

## 끝내기 전 확인

- [ ] 스키마 이름이 규칙에 맞고 swagger e2e 목록에 반영됐다
- [ ] 새 필드 · 파라미터 모두 한 줄 설명이 있다
- [ ] 요청 문자열 필드에 가짜 예시가 있다
- [ ] 검증 규칙(길이 · 형식 · 필수)이 문서에도 보인다
- [ ] 응답에 엔티티 · 내부 값이 섞이지 않았다
- [ ] swagger e2e 와 `npm run verify` 가 통과했다
