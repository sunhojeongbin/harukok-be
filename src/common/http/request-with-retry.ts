export type FetchFn = (url: string, init: RequestInit) => Promise<Response>;

export interface RetryOptions {
  /** 시도 1회당 제한 시간 */
  timeoutMs: number;
  /** 첫 시도 뒤 다시 시도할 횟수 */
  retries: number;
}

/** 탈퇴 연동 해제 호출 — 제공자가 응답하지 않아도 오래 멈추지 않게 한다 */
export const UNLINK_RETRY: RetryOptions = { timeoutMs: 5000, retries: 1 };

/**
 * 일시적 오류(네트워크 · 시간 초과 · 5xx)만 다시 시도한다. 4xx 는 그대로 돌려준다 (판단은 호출한 쪽이 한다).
 * 마지막 시도도 실패하면 그 오류(또는 5xx 응답)를 그대로 돌려준다.
 */
export async function requestWithRetry(
  fetchFn: FetchFn,
  url: string,
  init: RequestInit,
  options: RetryOptions,
): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const last = attempt >= options.retries;
    try {
      const res = await fetchFn(url, {
        ...init,
        signal: AbortSignal.timeout(options.timeoutMs),
      });
      if (res.status < 500 || last) return res;
    } catch (error) {
      if (last) throw error;
    }
  }
}
