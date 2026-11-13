import { Injectable, Module, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { EnvironmentVariables } from '../config/env.validation';

/**
 * compile() 단계에서는 연결하지 않고 app.init() 에서 연결한다.
 * 단위 테스트가 DB 없이 모듈을 조립할 수 있게 하기 위함이다. 종료 시 해제는 @nestjs/typeorm 이 한다.
 */
@Injectable()
class DatabaseConnector implements OnModuleInit {
  constructor(private readonly dataSource: DataSource) {}

  async onModuleInit(): Promise<void> {
    if (!this.dataSource.isInitialized) await this.dataSource.initialize();
  }
}

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvironmentVariables, true>) => ({
        type: 'postgres',
        url: config.get('DATABASE_URL', { infer: true }),
        autoLoadEntities: true,
        // 스키마 원본은 migrations/*.sql. TypeORM 이 스키마를 건드리지 않게 한다.
        synchronize: false,
        migrationsRun: false,
        manualInitialization: true,
      }),
    }),
  ],
  providers: [DatabaseConnector],
})
export class DatabaseModule {}
