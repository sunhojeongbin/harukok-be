import type { FetchFn } from '../../../common/http/request-with-retry';
import { HttpKakaoUnlinkClient, KAKAO_UNLINK_URL } from './kakao-unlink.client';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

function setup(...responses: (Response | Error)[]) {
  const fetchFn = jest.fn<ReturnType<FetchFn>, Parameters<FetchFn>>(() => {
    const next = responses.shift();
    if (!next) throw new Error('호출 횟수 초과');
    return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
  });
  return {
    client: new HttpKakaoUnlinkClient('fake-kakao-admin-key', fetchFn),
    fetchFn,
  };
}

describe('HttpKakaoUnlinkClient.unlink', () => {
  it('어드민 키 헤더와 회원번호(form)로 /v1/user/unlink 를 호출한다', async () => {
    const { client, fetchFn } = setup(json(200, { id: 1234567890 }));

    await expect(client.unlink('1234567890')).resolves.toBeUndefined();

    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe(KAKAO_UNLINK_URL);
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({
      authorization: 'KakaoAK fake-kakao-admin-key',
      'content-type': 'application/x-www-form-urlencoded',
    });
    const body = new URLSearchParams(init.body as string);
    expect(body.get('target_id_type')).toBe('user_id');
    expect(body.get('target_id')).toBe('1234567890');
  });

  it('이미 끊긴 회원(code -101)은 성공으로 본다 — unlink 는 멱등하지 않다', async () => {
    const { client } = setup(
      json(400, { msg: 'NotRegisteredUserException', code: -101 }),
    );

    await expect(client.unlink('1234567890')).resolves.toBeUndefined();
  });

  it('그 밖의 4xx 는 실패한다 (예: 어드민 키 오류 -401). 키 값은 메시지에 넣지 않는다', async () => {
    const { client, fetchFn } = setup(json(401, { msg: 'fake', code: -401 }));

    const error = await client.unlink('1234567890').then(
      () => null,
      (e: unknown) => e as Error,
    );

    expect(error?.message).toMatch(/401.*-401/);
    expect(error?.message).not.toContain('fake-kakao-admin-key');
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('5xx 면 한 번 더 시도한다', async () => {
    const { client, fetchFn } = setup(json(503, {}), json(200, { id: 1 }));

    await expect(client.unlink('1234567890')).resolves.toBeUndefined();
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('재시도에서 -101 이 오면 성공 — 첫 시도가 실제로는 끊었을 수 있다', async () => {
    const { client } = setup(
      new Error('fake ECONNRESET'),
      json(400, { msg: 'NotRegisteredUserException', code: -101 }),
    );

    await expect(client.unlink('1234567890')).resolves.toBeUndefined();
  });

  it('재시도까지 실패하면 예외', async () => {
    const { client } = setup(new Error('fake 1'), new Error('fake 2'));

    await expect(client.unlink('1234567890')).rejects.toThrow('fake 2');
  });
});
