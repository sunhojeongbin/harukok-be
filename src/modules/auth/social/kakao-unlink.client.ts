import {
  type FetchFn,
  requestWithRetry,
  UNLINK_RETRY,
} from '../../../common/http/request-with-retry';

export const KAKAO_UNLINK_CLIENT = Symbol('KAKAO_UNLINK_CLIENT');
export const KAKAO_UNLINK_URL = 'https://kapi.kakao.com/v1/user/unlink';

/** 탈퇴 시 어드민 키 + 회원번호로 카카오 연결을 끊는다 (API 설계서 5-6). 실패하면 예외 */
export interface KakaoUnlinkClient {
  unlink(kakaoUserId: string): Promise<void>;
}

/** 이미 끊긴 회원 — unlink 는 멱등하지 않아 재호출하면 이 코드가 온다. 성공으로 본다 */
export const KAKAO_NOT_REGISTERED_USER = -101;

export class HttpKakaoUnlinkClient implements KakaoUnlinkClient {
  constructor(
    private readonly adminKey: string,
    private readonly fetchFn: FetchFn = fetch,
  ) {}

  /** 일시적 오류는 한 번 더 시도한다 (재시도에서 -101 이 오면 첫 시도가 이미 끊은 것 — 성공) */
  async unlink(kakaoUserId: string): Promise<void> {
    const res = await requestWithRetry(
      this.fetchFn,
      KAKAO_UNLINK_URL,
      {
        method: 'POST',
        headers: {
          authorization: `KakaoAK ${this.adminKey}`,
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          target_id_type: 'user_id',
          target_id: kakaoUserId,
        }).toString(),
      },
      UNLINK_RETRY,
    );
    if (res.ok) return;
    const json = (await res.json().catch(() => ({}))) as { code?: unknown };
    if (json.code === KAKAO_NOT_REGISTERED_USER) return;
    // 카카오 오류 코드만 남긴다. 어드민 키는 넣지 않는다
    throw new Error(
      `카카오 /v1/user/unlink 실패: ${res.status} ${typeof json.code === 'number' ? json.code : ''}`,
    );
  }
}
