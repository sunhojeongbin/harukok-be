import { isSwaggerEnabled } from './setup-swagger';

describe('isSwaggerEnabled', () => {
  it('운영(production)에서는 끈다', () => {
    expect(isSwaggerEnabled('production')).toBe(false);
  });

  it.each(['development', 'test', undefined])('%s 에서는 켠다', (nodeEnv) => {
    expect(isSwaggerEnabled(nodeEnv)).toBe(true);
  });
});
