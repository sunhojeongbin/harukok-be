import { type FetchFn, requestWithRetry } from './request-with-retry';

const OPTIONS = { timeoutMs: 50, retries: 1 };
const res = (status: number) => new Response('{}', { status });

function fetchSequence(...steps: (Response | Error | 'hang')[]) {
  return jest.fn<ReturnType<FetchFn>, Parameters<FetchFn>>((_url, init) => {
    const step = steps.shift();
    if (step === undefined) throw new Error('호출 횟수 초과');
    if (step === 'hang') {
      // signal 이 끊으면 AbortError 로 끝난다
      return new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () =>
          reject(new DOMException('aborted', 'AbortError')),
        );
      });
    }
    return step instanceof Error ? Promise.reject(step) : Promise.resolve(step);
  });
}

describe('requestWithRetry', () => {
  it('2xx 면 한 번만 호출하고 응답을 돌려준다', async () => {
    const fetchFn = fetchSequence(res(200));

    await expect(
      requestWithRetry(fetchFn, 'https://example.com', {}, OPTIONS),
    ).resolves.toMatchObject({ status: 200 });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('4xx 는 다시 시도하지 않고 그대로 돌려준다 (카카오 -101 판단은 호출한 쪽)', async () => {
    const fetchFn = fetchSequence(res(400));

    await expect(
      requestWithRetry(fetchFn, 'https://example.com', {}, OPTIONS),
    ).resolves.toMatchObject({ status: 400 });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('5xx 면 한 번 더 시도한다', async () => {
    const fetchFn = fetchSequence(res(503), res(200));

    await expect(
      requestWithRetry(fetchFn, 'https://example.com', {}, OPTIONS),
    ).resolves.toMatchObject({ status: 200 });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('네트워크 오류면 한 번 더 시도한다', async () => {
    const fetchFn = fetchSequence(new Error('fake ECONNRESET'), res(200));

    await expect(
      requestWithRetry(fetchFn, 'https://example.com', {}, OPTIONS),
    ).resolves.toMatchObject({ status: 200 });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('응답이 없으면 제한 시간에 끊고 한 번 더 시도한다', async () => {
    const fetchFn = fetchSequence('hang', res(200));

    await expect(
      requestWithRetry(fetchFn, 'https://example.com', {}, OPTIONS),
    ).resolves.toMatchObject({ status: 200 });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('재시도까지 모두 5xx 면 마지막 5xx 응답을 돌려준다', async () => {
    const fetchFn = fetchSequence(res(500), res(502));

    await expect(
      requestWithRetry(fetchFn, 'https://example.com', {}, OPTIONS),
    ).resolves.toMatchObject({ status: 502 });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('재시도까지 모두 네트워크 오류면 마지막 오류로 실패한다', async () => {
    const fetchFn = fetchSequence(new Error('fake 1'), new Error('fake 2'));

    await expect(
      requestWithRetry(fetchFn, 'https://example.com', {}, OPTIONS),
    ).rejects.toThrow('fake 2');
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('요청 본문·헤더를 매 시도에 그대로 보낸다', async () => {
    const fetchFn = fetchSequence(res(503), res(200));
    const init = { method: 'POST', body: 'a=1', headers: { x: 'y' } };

    await requestWithRetry(fetchFn, 'https://example.com', init, OPTIONS);

    for (const [url, sent] of fetchFn.mock.calls) {
      expect(url).toBe('https://example.com');
      expect(sent).toMatchObject(init);
    }
  });
});
