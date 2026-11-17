import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UsersController } from './controller/users.controller';
import { PgUsersStore, USERS_STORE } from './repositories/users.store';
import { GetMeUseCase } from './usecases/get-me.usecase';
import { WithdrawUseCase } from './usecases/withdraw.usecase';

@Module({
  // 애플 revoke · 카카오 unlink 클라이언트와 TokenCipher 는 AuthModule 이 만든다
  imports: [AuthModule],
  controllers: [UsersController],
  providers: [
    GetMeUseCase,
    WithdrawUseCase,
    { provide: USERS_STORE, useClass: PgUsersStore },
  ],
})
export class UsersModule {}
