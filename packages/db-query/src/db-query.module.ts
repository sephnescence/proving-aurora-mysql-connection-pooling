import { Module } from '@nestjs/common'
import { LoggerModule } from 'nestjs-pino'
import { DbQueryService } from './db-query.service'

@Module({
  imports: [LoggerModule.forRoot()],
  providers: [DbQueryService],
  exports: [DbQueryService],
})
export class DbQueryModule {}
