// 이 파일을 AppModule 보다 먼저 import 하면 앱이 DEV_TEST_LOGIN=true 로 뜬다 (AppModule 은 import 시점에 env 를 읽는다).
process.env.DEV_TEST_LOGIN = 'true';
