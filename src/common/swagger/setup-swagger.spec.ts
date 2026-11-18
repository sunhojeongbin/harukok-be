import { isSwaggerEnabled } from './setup-swagger';

describe('isSwaggerEnabled', () => {
  it('운영(production)에서는 끈다', () => {
    expect(isSwaggerEnabled('production')).toBe(false);
  });

  it.each(['development', 'test'])('%s 에서는 켠다', (nodeEnv) => {
    expect(isSwaggerEnabled(nodeEnv)).toBe(true);
  });

  // 보안 점검 #2: '운영이면 끈다' 가 아니라 '개발·테스트일 때만 켠다' — 값이 빠지거나 낯설면 끈다
  it.each([undefined, '', 'staging', 'prod'])(
    'NODE_ENV 가 %j 이면 끈다 (허용 목록 밖)',
    (nodeEnv) => {
      expect(isSwaggerEnabled(nodeEnv)).toBe(false);
    },
  );
});
