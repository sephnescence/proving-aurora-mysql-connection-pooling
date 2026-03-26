import { Module } from '@nestjs/common'
import { LoggerModule } from 'nestjs-pino'
import { DbQueryModule } from '@pooling-poc/db-query'
import { ProcesslistController } from './processlist.controller'
import { HealthModule } from './health.module'

@Module({
  imports: [LoggerModule.forRoot(), DbQueryModule, HealthModule],
  controllers: [ProcesslistController],
})
export class AppModule {}
