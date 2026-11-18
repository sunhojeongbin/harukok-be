import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;

/**
 * 제공자 토큰 양방향 암호화 (AES-256-GCM). 키는 base64 32바이트, DB 밖(환경변수)에 둔다.
 * 암호문 형식: iv(12) | tag(16) | ciphertext
 */
export class TokenCipher {
  private readonly key: Buffer;

  constructor(keyBase64: string) {
    this.key = Buffer.from(keyBase64, 'base64');
    if (this.key.length !== 32) {
      throw new Error('TOKEN_ENCRYPTION_KEY 는 base64 32바이트여야 합니다.');
    }
  }

  // 암호화된 토큰을 생성합니다. (DB에 저장)
  encrypt(plain: string): Buffer {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), body]);
  }

  // 암호화된 토큰을 복호화합니다. (DB에서 읽음)
  decrypt(sealed: Buffer): string {
    const iv = sealed.subarray(0, IV_BYTES);
    const tag = sealed.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
    const body = sealed.subarray(IV_BYTES + TAG_BYTES);
    const decipher = createDecipheriv(ALGORITHM, this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(body), decipher.final()]).toString(
      'utf8',
    );
  }
}
