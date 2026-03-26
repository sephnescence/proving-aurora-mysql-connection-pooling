import { Controller, Get, Headers, BadRequestException } from '@nestjs/common'
import { DbQueryService } from '@pooling-poc/db-query'

@Controller('processlist')
export class ProcesslistController {
  constructor(private readonly dbQueryService: DbQueryService) { }

  @Get()
  async getProcesslist(@Headers('x-test-type') testType: string | undefined) {
    if (!testType) {
      throw new BadRequestException('X-Test-Type header is required')
    }
    return this.dbQueryService.processlist(testType)
  }
}
