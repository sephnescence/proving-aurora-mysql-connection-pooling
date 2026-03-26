import { Controller, Get } from '@nestjs/common'
import { HealthCheck, HealthCheckService } from '@nestjs/terminus'
import { DbQueryService } from '@pooling-poc/db-query'

@Controller('health')
export class HealthController {
    constructor(
        private health: HealthCheckService,
        private dbQueryService: DbQueryService,
    ) {}

    @Get()
    @HealthCheck()
    check() {
        return this.health.check([
            async () => {
                await this.dbQueryService.ping()
                return { db: { status: 'up' } }
            },
        ])
    }
}
