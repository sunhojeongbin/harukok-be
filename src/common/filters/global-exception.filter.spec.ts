import {
  ArgumentsHost,
  BadRequestException,
  HttpException,
  HttpStatus,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { BusinessException } from '../errors/business.exception';
import { GlobalExceptionFilter } from './global-exception.filter';

function mockHost() {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  const host = {
    switchToHttp: () => ({ getResponse: () => res }),
  } as unknown as ArgumentsHost;
  return { host, res };
}

describe('GlobalExceptionFilter', () => {
  const filter = new GlobalExceptionFilter();

  let logError: jest.SpyInstance;

  beforeEach(() => {
    logError = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('BusinessException 은 정의된 상태 코드와 { code, message } 로 응답한다', () => {
    const { host, res } = mockHost();

    filter.catch(
      new BusinessException({
        code: 'FAKE_CONFLICT',
        status: HttpStatus.CONFLICT,
        message: '가짜 충돌',
      }),
      host,
    );

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      code: 'FAKE_CONFLICT',
      message: '가짜 충돌',
    });
  });

  it('BadRequestException(ValidationPipe 기본·JSON 파싱 실패)은 VALIDATION_FAILED 로 바꾼다', () => {
    const { host, res } = mockHost();

    filter.catch(new BadRequestException(['title must be a string']), host);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'VALIDATION_FAILED' }),
    );
  });

  it('없는 경로(NotFoundException)는 404 NOT_FOUND 로 응답한다', () => {
    const { host, res } = mockHost();

    filter.catch(new NotFoundException(), host);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'NOT_FOUND' }),
    );
  });

  it('그 밖의 HttpException 은 상태 이름을 code 로 쓴다', () => {
    const { host, res } = mockHost();

    filter.catch(new HttpException('x', HttpStatus.METHOD_NOT_ALLOWED), host);

    expect(res.status).toHaveBeenCalledWith(405);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'METHOD_NOT_ALLOWED' }),
    );
  });

  it('예상 못 한 예외는 500 INTERNAL_ERROR 로 응답하고 원래 메시지를 노출하지 않는다', () => {
    const { host, res } = mockHost();

    filter.catch(new Error('fake internal detail'), host);

    expect(res.status).toHaveBeenCalledWith(500);
    const body = (
      res.json.mock.calls[0] as [{ code: string; message: string }]
    )[0];
    expect(body.code).toBe('INTERNAL_ERROR');
    expect(body.message).not.toContain('fake internal detail');
    expect(logError).toHaveBeenCalled();
  });
});
