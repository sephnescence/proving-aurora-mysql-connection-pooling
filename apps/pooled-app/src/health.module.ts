import { Module } from '@nestjs/common'
import { TerminusModule } from '@nestjs/terminus'
import { HealthController } from './health.controller'
import { DbQueryModule } from '@pooling-poc/db-query'

@Module({
  imports: [TerminusModule, DbQueryModule],
  controllers: [HealthController],
})
export class HealthModule {}
