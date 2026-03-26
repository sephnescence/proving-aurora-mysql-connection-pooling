import { Module } from '@nestjs/common'
import { TerminusModule } from '@nestjs/terminus'
import { HttpModule } from '@nestjs/axios'
import { HealthController } from './health.controller'
import { DbQueryModule } from '@pooling-poc/db-query'

@Module({
  imports: [TerminusModule, HttpModule, DbQueryModule],
  controllers: [HealthController],
})
export class HealthModule {}
