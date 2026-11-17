import { randomBytes } from 'node:crypto';
import { TokenCipher } from './token-cipher';

const fakeKey = () => randomBytes(32).toString('base64');

describe('TokenCipher', () => {
  it('암호화 후 복호화하면 원문이 나온다', () => {
    const cipher = new TokenCipher(fakeKey());

    expect(cipher.decrypt(cipher.encrypt('fake-apple-refresh-token'))).toBe(
      'fake-apple-refresh-token',
    );
  });

  it('암호문에 원문이 그대로 들어 있지 않다', () => {
    const cipher = new TokenCipher(fakeKey());

    const sealed = cipher.encrypt('fake-apple-refresh-token');

    expect(sealed.toString('utf8')).not.toContain('fake-apple-refresh-token');
    expect(sealed.length).toBeGreaterThan(12 + 16);
  });

  it('같은 원문도 매번 다른 암호문이 된다 (iv 무작위)', () => {
    const cipher = new TokenCipher(fakeKey());

    expect(cipher.encrypt('same').equals(cipher.encrypt('same'))).toBe(false);
  });

  it('다른 키로는 복호화할 수 없다', () => {
    const sealed = new TokenCipher(fakeKey()).encrypt('fake');

    expect(() => new TokenCipher(fakeKey()).decrypt(sealed)).toThrow();
  });

  it('변조된 암호문은 복호화하지 않는다 (GCM 인증 태그)', () => {
    const cipher = new TokenCipher(fakeKey());
    const sealed = cipher.encrypt('fake');
    sealed[sealed.length - 1] ^= 0xff;

    expect(() => cipher.decrypt(sealed)).toThrow();
  });

  it('키가 32바이트가 아니면 만들 수 없다', () => {
    expect(() => new TokenCipher(randomBytes(16).toString('base64'))).toThrow(
      /32/,
    );
  });
});
