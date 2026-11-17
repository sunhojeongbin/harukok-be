import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TermsController } from './controller/terms.controller';
import { CurrentTermBootCheck } from './current-term.boot-check';
import { Term } from './entities/term.entity';
import { GetCurrentTermsUseCase } from './usecases/get-current-terms.usecase';

@Module({
  imports: [TypeOrmModule.forFeature([Term])],
  controllers: [TermsController],
  providers: [GetCurrentTermsUseCase, CurrentTermBootCheck],
  // 소셜 로그인이 신규 가입의 동의 대상(현행 이용약관)을 같은 판정으로 확인한다
  exports: [GetCurrentTermsUseCase],
})
export class TermsModule {}
