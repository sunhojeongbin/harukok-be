'use strict';
// 구글 · 카카오 실제 로그인 수동 테스트 — 한 페이지에서 (로컬 전용). 사용법: docs/guides/real-social-login-test.md
// 각 제공자 로그인 → 백엔드 POST /auth/social/login → GET /users/me → POST /auth/logout
// 키는 이 파일에 넣지 않는다 — 실행할 때 인자로 받고, 카카오 클라이언트 시크릿은 터미널에서 가려서 입력받는다.
// 토큰 · 시크릿 원문은 터미널에 출력하지 않는다. Swagger 복사용 본문은 이 로컬 페이지에서만 쓴다.
// 자동 테스트(npm run test*)에서는 쓰지 않는다 — 실제 제공자를 호출한다.
// 사용법: node scripts/manual/social-login-test.cjs --google <웹 클라이언트 ID> --kakao <REST API 키> [--backend http://localhost:3000]
const http = require('node:http');
const { randomBytes } = require('node:crypto');
const readline = require('node:readline');

const args = {};
for (let i = 2; i < process.argv.length; i += 2)
  args[process.argv[i].replace(/^--/, '')] = process.argv[i + 1];
const GOOGLE_ID = args.google;
const KAKAO_KEY = args.kakao;
const BACKEND = args.backend ?? 'http://localhost:3000';
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BACKEND)) {
  console.error('--backend 는 로컬(http://localhost:포트)만 허용한다');
  process.exit(1);
}
const PORT = 5500;
const KAKAO_REDIRECT = `http://localhost:${PORT}/kakao/callback`;

const usage = () => {
  console.error(
    '사용법: node scripts/manual/social-login-test.cjs --google "<웹 클라이언트 ID>" --kakao "<REST API 키>"  (하나만 줘도 됨)',
  );
  process.exit(1);
};
if (!GOOGLE_ID && !KAKAO_KEY) usage();
if (GOOGLE_ID && !GOOGLE_ID.endsWith('.apps.googleusercontent.com')) usage();
if (KAKAO_KEY && !/^[0-9a-f]{32}$/i.test(KAKAO_KEY)) usage();

const mask = (t) =>
  typeof t === 'string' ? `${t.slice(0, 8)}…(${t.length}자)` : t;
const states = new Set();
const results = {}; // { GOOGLE: { report, swaggerBody, at }, KAKAO: ... }
let kakaoSecret = '';

function askHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });
    rl._writeToOutput = (s) => {
      if (s.startsWith(question)) process.stdout.write(s);
    };
    rl.question(question, (a) => {
      rl.close();
      process.stdout.write('\n');
      resolve(a.trim());
    });
  });
}

function claims(idToken) {
  try {
    const p = JSON.parse(
      Buffer.from(idToken.split('.')[1], 'base64url').toString(),
    );
    return {
      iss: p.iss,
      aud: p.aud,
      email: p.email,
      email_verified: p.email_verified,
      name: p.name ?? p.nickname,
      exp: new Date(p.exp * 1000).toISOString(),
    };
  } catch {
    return { error: 'id_token 해석 실패' };
  }
}

async function call(method, path, body, accessToken) {
  const res = await fetch(BACKEND + path, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, body: json };
}

async function runFlow(provider, idToken) {
  const deviceId = `manual-${provider.toLowerCase()}-test`;
  const report = { tokenClaims: claims(idToken) };
  const login = await call('POST', '/auth/social/login', {
    provider,
    idToken,
    deviceId,
  });
  report.login = {
    status: login.status,
    body: login.body && {
      ...login.body,
      accessToken: mask(login.body.accessToken),
      refreshToken: mask(login.body.refreshToken),
    },
  };
  if (login.status === 200) {
    report.me = await call('GET', '/users/me', null, login.body.accessToken);
    const logout = await call(
      'POST',
      '/auth/logout',
      { refreshToken: login.body.refreshToken, deviceId },
      login.body.accessToken,
    );
    report.logout = { status: logout.status };
  }
  const ok =
    report.login.status === 200 &&
    report.me?.status === 200 &&
    report.logout?.status === 204;
  results[provider] = {
    ok,
    report,
    swaggerBody: JSON.stringify(
      { provider, idToken, deviceId: 'swagger' },
      null,
      2,
    ),
    at: new Date().toLocaleTimeString('ko-KR'),
  };
  console.log(
    `\n[${provider}] ${ok ? '성공' : '실패'}\n${JSON.stringify(report, null, 2)}`,
  );
}

async function exchangeKakaoCode(code) {
  const form = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: KAKAO_KEY,
    redirect_uri: KAKAO_REDIRECT,
    code,
  });
  if (kakaoSecret) form.set('client_secret', kakaoSecret);
  const res = await fetch('https://kauth.kakao.com/oauth/token', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded;charset=utf-8',
    },
    body: form,
  });
  const json = await res.json();
  if (!res.ok)
    throw new Error(
      `카카오 토큰 교환 실패 ${res.status}: ${json.error_code ?? ''} ${json.error_description ?? json.error ?? ''}`,
    );
  if (!json.id_token)
    throw new Error(
      'id_token 이 없습니다 — 카카오 로그인 > OpenID Connect 활성화를 확인하세요',
    );
  return json.id_token;
}

const page = `<!doctype html><meta charset="utf-8"><title>소셜 로그인 테스트</title>
${GOOGLE_ID ? '<script src="https://accounts.google.com/gsi/client" async></script>' : ''}
<style>
body{font-family:sans-serif;max-width:1100px;margin:32px auto;padding:0 16px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:16px}
.card{border:1px solid #ddd;border-radius:8px;padding:16px}
pre{background:#f4f4f4;padding:12px;white-space:pre-wrap;word-break:break-all;font-size:12px;max-height:480px;overflow:auto}
.ok{color:#0a7d2c;font-weight:bold}.fail{color:#c62828;font-weight:bold}
.kakao{display:inline-block;background:#FEE500;color:#000;padding:10px 18px;border-radius:6px;text-decoration:none}
</style>
<h2>하루콕 — 소셜 로그인 수동 테스트</h2>
<p>백엔드: ${BACKEND}. 각 버튼으로 로그인하면 로그인 → 내 정보 → 로그아웃을 자동 호출한다.</p>
<div class="grid">
  <div class="card"><h3>구글</h3>
    ${GOOGLE_ID ? `<div id="g_id_onload" data-client_id="${GOOGLE_ID}" data-callback="onGoogle" data-auto_prompt="false"></div><div class="g_id_signin" data-type="standard"></div>` : '<p>--google 을 주지 않아 꺼져 있다</p>'}
    <div id="GOOGLE"></div></div>
  <div class="card"><h3>카카오</h3>
    ${KAKAO_KEY ? '<a class="kakao" href="/kakao/start">카카오로 로그인</a>' : '<p>--kakao 를 주지 않아 꺼져 있다</p>'}
    <div id="KAKAO"></div></div>
</div>
<script>
async function render() {
  const data = await (await fetch('/results')).json();
  for (const p of ['GOOGLE', 'KAKAO']) {
    const el = document.getElementById(p), r = data[p];
    if (!r) { el.innerHTML = '<p>아직 결과 없음</p>'; continue; }
    el.innerHTML = '<p class="' + (r.ok ? 'ok' : 'fail') + '">' + (r.ok ? '성공' : '실패') + ' · ' + r.at + '</p>'
      + '<p><button>Swagger 로그인 요청 본문 복사</button> <span></span></p><pre></pre>';
    el.querySelector('pre').textContent = JSON.stringify(r.report, null, 2);
    const [btn, msg] = [el.querySelector('button'), el.querySelector('span')];
    btn.onclick = async () => { await navigator.clipboard.writeText(r.swaggerBody); msg.textContent = '복사됨 (id_token 은 짧게 유효)'; };
  }
}
async function onGoogle(r) {
  document.getElementById('GOOGLE').innerHTML = '<p>백엔드 호출 중…</p>';
  await fetch('/google', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ idToken: r.credential }) });
  render();
}
render();
</script>`;

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const send = (status, type, body) => {
      res.writeHead(status, { 'content-type': type });
      res.end(body);
    };
    const back = () => {
      res.writeHead(302, { location: '/' });
      res.end();
    };
    const fail = (provider, message) => {
      results[provider] = {
        ok: false,
        report: { error: message },
        swaggerBody: '',
        at: new Date().toLocaleTimeString('ko-KR'),
      };
      console.error(`\n[${provider}] 실패: ${message}`);
    };

    try {
      if (req.method === 'GET' && url.pathname === '/')
        return send(200, 'text/html; charset=utf-8', page);
      if (req.method === 'GET' && url.pathname === '/results')
        return send(200, 'application/json', JSON.stringify(results));
      if (req.method === 'POST' && url.pathname === '/google' && GOOGLE_ID) {
        let raw = '';
        for await (const chunk of req) raw += chunk;
        await runFlow('GOOGLE', JSON.parse(raw).idToken).catch((e) =>
          fail('GOOGLE', e.message),
        );
        return send(200, 'application/json', '{}');
      }
      if (url.pathname === '/kakao/start' && KAKAO_KEY) {
        const state = randomBytes(16).toString('hex');
        states.add(state);
        // scope 를 비우면 콘솔에 설정한 동의항목 전체 + (OIDC 활성화 시) openid 를 요청한다
        const auth = new URL('https://kauth.kakao.com/oauth/authorize');
        auth.search = new URLSearchParams({
          client_id: KAKAO_KEY,
          redirect_uri: KAKAO_REDIRECT,
          response_type: 'code',
          state,
        }).toString();
        res.writeHead(302, { location: auth.toString() });
        return res.end();
      }
      if (url.pathname === '/kakao/callback' && KAKAO_KEY) {
        const {
          code,
          state,
          error,
          error_description: desc,
        } = Object.fromEntries(url.searchParams);
        if (error) fail('KAKAO', `카카오 오류: ${error} ${desc ?? ''}`);
        else if (!state || !states.delete(state))
          fail('KAKAO', 'state 가 맞지 않습니다. 처음부터 다시 시도하세요');
        else
          await exchangeKakaoCode(code)
            .then((t) => runFlow('KAKAO', t))
            .catch((e) => fail('KAKAO', e.message));
        return back();
      }
      send(404, 'text/plain', 'not found');
    } catch (e) {
      send(500, 'text/plain; charset=utf-8', e.message);
    }
  })
  .listen(PORT, 'localhost', async () => {
    if (KAKAO_KEY)
      kakaoSecret = await askHidden(
        '카카오 클라이언트 시크릿 (사용 안 하면 그냥 Enter): ',
      );
    console.log(
      `브라우저에서 http://localhost:${PORT} 을 여세요. 백엔드: ${BACKEND}`,
    );
    console.log(
      `구글: ${GOOGLE_ID ? '켜짐 (JavaScript 원본 http://localhost:5500)' : '꺼짐'} · 카카오: ${KAKAO_KEY ? `켜짐 (리다이렉트 URI ${KAKAO_REDIRECT})` : '꺼짐'}`,
    );
  });
