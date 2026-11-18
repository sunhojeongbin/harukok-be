// 이 파일을 AppModule 보다 먼저 import 하면 앱이 기본 요청 제한(1분 30회) + 프록시 1단(TRUST_PROXY=1)으로 뜬다.
delete process.env.RATE_LIMIT_PER_MINUTE;
process.env.TRUST_PROXY = '1';
