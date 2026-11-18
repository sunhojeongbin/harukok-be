// 이 파일을 AppModule 보다 먼저 import 하면 앱이 기본 요청 제한(1분 30회)과 TRUST_PROXY 없음으로 뜬다.
// 다른 e2e 는 setup-env 가 제한을 크게 풀어 두므로, 제한을 검증하는 파일에서만 되돌린다.
delete process.env.RATE_LIMIT_PER_MINUTE;
delete process.env.TRUST_PROXY;
