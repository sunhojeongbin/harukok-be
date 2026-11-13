import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TermsController } from './controller/terms.controller';
import { Term } from './entities/term.entity';
import { GetCurrentTermsUseCase } from './usecases/get-current-terms.usecase';

@Module({
  imports: [TypeOrmModule.forFeature([Term])],
  controllers: [TermsController],
  providers: [GetCurrentTermsUseCase],
})
export class TermsModule {}
