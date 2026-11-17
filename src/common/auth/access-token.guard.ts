import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { jwtVerify } from 'jose';
import type { EnvironmentVariables } from '../config/env.validation';
import { BusinessException } from '../errors/business.exception';
import { AccessTokenErrors } from './access-token.errors';

export interface AuthenticatedRequest {
  headers: Record<string, string | string[] | undefined>;
  user?: { userId: string };
}

/** Authorization: Bearer <JWT HS256> 를 검증하고 request.user.userId 를 채운다 (API 설계서 6-1) */
@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.headers.authorization;
    // RFC 6750: 스킴은 대소문자 무시, 공백 하나 뒤 토큰
    const match =
      typeof header === 'string' ? /^Bearer\s+(\S+)$/i.exec(header) : null;
    if (!match)
      throw new BusinessException(AccessTokenErrors.ACCESS_TOKEN_INVALID);
    try {
      const { payload } = await jwtVerify(match[1], this.key(), {
        algorithms: ['HS256'],
      });
      if (typeof payload.sub !== 'string' || payload.sub === '') {
        throw new Error('sub 없음');
      }
      request.user = { userId: payload.sub };
      return true;
    } catch {
      // 원인(만료·서명·형식)은 응답에 노출하지 않는다
      throw new BusinessException(AccessTokenErrors.ACCESS_TOKEN_INVALID);
    }
  }

  private key(): Uint8Array {
    return new TextEncoder().encode(
      this.config.get('JWT_ACCESS_SECRET', { infer: true }),
    );
  }
}

/** AccessTokenGuard 가 채운 사용자 ID */
export const CurrentUserId = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    return request.user?.userId ?? '';
  },
);
