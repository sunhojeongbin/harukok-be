# Swagger DTO 작성 규칙

앱 개발자가 Swagger(`/docs`)만 보고 **각 값이 무엇인지, 무엇을 넣어야 하는지** 알 수 있게 하는 규칙이다. 이 프로젝트는 Swagger CLI 플러그인을 쓰지 않으므로(CLAUDE.md 3장) 문서에 보이는 것은 전부 `@ApiProperty` · `@ApiParam` · `@ApiOkResponse` 에 직접 적은 것뿐이다.

규칙 대부분은 `test/swagger.e2e-spec.ts` 가 검사한다. 어기면 `npm run test:e2e` 가 실패한다.

## 1. 이름

| 용도                | 이름                             | 예                                                      |
| ------------------- | -------------------------------- | ------------------------------------------------------- |
| 요청 본문           | `…RequestDto`                    | `CreateTodoRequestDto`, `SessionRequestDto`             |
| 응답 본문           | `…ResponseDto`                   | `TodoResponseDto`, `ErrorResponseDto`                   |
| 쿼리 파라미터       | `…QueryDto`                      | `ListTodosQueryDto` (스키마가 아니라 파라미터로 풀린다) |
| 응답 안의 중첩 객체 | 부모 이름에서 드러나면 예외 허용 | `LoginUserDto` (로그인 응답의 `user`)                   |

- 요청 · 응답 · 등록 · 수정을 **한 클래스로 같이 쓰지 않는다.** 필드가 같아 보여도 규칙(필수 여부 · 검증)이 다르다
- 파일 이름도 클래스와 맞춘다 (`ErrorResponseDto` → `error-response.dto.ts`)
- Swagger 스키마 이름 목록은 e2e 가 고정한다. DTO 를 추가 · 삭제 · 이름 변경하면 그 목록도 고친다

## 2. 설명 (`description`)

- **모든 필드와 모든 경로 · 쿼리 파라미터에** 쓴다. **한 줄**이다
- 순서는 **무엇인지 → 핵심 규칙**: `할 일 제목(HTML 제거 후 1~250자, 공백 거부)`
- NULL 이 올 수 있으면 그 뜻을 쓴다: `완료한 시각. NULL 이면 미완료`
- 시각은 기준을 쓴다: `등록한 시각 (서버 시각, ISO 8601)`
- 공용 설정(`TITLE_DOC` · `DATE_FORMAT` 등)에는 **규칙(길이 · 형식 · 예시)만** 두고, 설명은 필드마다 따로 쓴다. 공용 설명을 쓰면 `date` · `dueDate` · `startDate` 가 모두 같은 문장이 되어 무엇인지 구분이 안 된다
- 경로 파라미터는 `@ApiParam` 으로 설명한다 (`todoId` — `TODO_ID_PARAM`)

## 3. 예시 (`example`)

- **요청 DTO 의 문자열 필드는 전부** 예시를 둔다. 없으면 Swagger UI 에 `"string"` 만 보여서 바로 실행해 볼 수 없다
- 응답의 자유 텍스트 · 토큰 필드(`title` · `name` · `email` · `accessToken` · `refreshToken`)도 예시를 둔다
- enum · boolean · `format: uuid` · `format: date-time` 은 Swagger UI 가 알아서 채우므로 생략해도 된다
- **가짜 값만 쓴다** (CLAUDE.md 5장). 실제 토큰 · 이메일 · 클라이언트 ID 금지. 인증 관련 예시는 `src/modules/auth/dto/swagger-docs.ts` 의 `EXAMPLE` 에 모아 둔다
- 배열 응답은 기본 예시가 1개만 나온다. 여러 개를 보여 주려면 응답 데코레이터에 `example` 을 직접 준다 (`GET /todos/stats` 참고)

## 4. 검증 규칙을 문서에

class-validator 규칙은 문서에 자동으로 실리지 않는다. 같은 값을 `@ApiProperty` 에도 적는다.

| 검증                                      | 문서                                                 |
| ----------------------------------------- | ---------------------------------------------------- |
| `@MaxLength(n)` · `@TextLength(min, max)` | `maxLength` · `minLength`                            |
| `@IsDateOnly()`                           | `format: 'date'` (`DATE_FORMAT`)                     |
| `@IsOptional()`                           | `@ApiPropertyOptional`                               |
| `@ValidateIf(...)` (조건부 필수)          | `@ApiPropertyOptional` + 설명에 조건 (`애플만 필수`) |
| `@Matches(/\S/)` 같은 형식 제약           | 설명에 한 마디 (`공백만은 거부`)                     |

`@IsOptional` 과 `@ApiPropertyOptional` 은 항상 짝을 맞춘다. 어긋나면 문서의 필수 표시가 실제와 달라진다.

## 5. 노출하지 않을 것

- **엔티티를 그대로 반환하지 않는다.** 응답은 전용 DTO 를 만들고 매퍼 · UseCase 에서 필요한 필드만 골라 담는다 (`toTodoResponse`, 약관 `{ id, version, contentUrl }`)
- 토큰 해시 · 애플 refresh token 암호문 · `user_id` · `deleted_at` 같은 내부 값은 **DTO 에 아예 두지 않는다.** 그래서 `@ApiHideProperty` 가 필요 없다
- Swagger 는 `NODE_ENV` 가 `development` · `test` 일 때만 켜진다

## 6. 중첩 객체 · enum

- 중첩 객체는 별도 DTO 로 만들고 `@ApiProperty({ type: 하위Dto })` 로 연결한다. 배열은 `type: [하위Dto]`
- 여러 DTO 가 같은 enum 을 쓰면 `enumName` 으로 공유 스키마 하나를 만든다. 소셜 제공자는 `SOCIAL_PROVIDER_SCHEMA` (`enumName: 'SocialProvider'`)

## 새 DTO · 필드를 추가할 때 체크리스트

- [ ] 이름이 `…RequestDto` / `…ResponseDto` / `…QueryDto` 이고, swagger e2e 의 스키마 이름 목록에 넣었다
- [ ] 모든 필드에 한 줄 설명 — 무엇인지 → 핵심 규칙 (NULL 의미 · 시각 기준 포함)
- [ ] 요청 문자열 필드 · 응답 자유 텍스트에 가짜 예시
- [ ] 검증 규칙(길이 · 형식 · 필수 여부)을 `@ApiProperty` 에도 적었다
- [ ] 경로 파라미터에 `@ApiParam`
- [ ] 엔티티 · 내부 값이 응답에 섞이지 않는다
- [ ] 공유 enum 은 `enumName`
- [ ] `npm run test:e2e` (swagger e2e) 통과
