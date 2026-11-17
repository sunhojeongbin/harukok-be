import { Injectable, PipeTransform } from '@nestjs/common';
import { isUUID } from 'class-validator';
import { BusinessException } from '../../../common/errors/business.exception';
import { TodosErrors } from '../errors/todos.errors';

/** 경로의 todoId 가 UUID 가 아니면 DB 까지 가지 않고 TODO_NOT_FOUND (존재하지 않는 것과 같다) */
@Injectable()
export class TodoIdPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!isUUID(value)) throw new BusinessException(TodosErrors.TODO_NOT_FOUND);
    return value;
  }
}
