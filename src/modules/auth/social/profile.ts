import { stripHtml } from '../../../common/text/strip-html';

const NAME_MAX = 50;

/** 소셜 이메일 정규화: lower(btrim()). DB ck_users_email(3~254자)을 못 지키면 NULL. */
export function normalizeEmail(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const email = raw.trim().toLowerCase();
  const length = [...email].length;
  return length >= 3 && length <= 254 ? email : null;
}

/** 소셜 이름 정규화: HTML 제거 → 50자 절삭(글자 단위, DB char_length 기준). 비면 NULL (DB ck_users_name). */
export function normalizeName(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const name = [...stripHtml(raw)].slice(0, NAME_MAX).join('').trimEnd();
  return name === '' ? null : name;
}
