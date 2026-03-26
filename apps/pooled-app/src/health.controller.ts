import { Controller, Get } from '@nestjs/common'
import {
    HealthCheck,
    HealthCheckService,
    HttpHealthIndicator,
} from '@nestjs/terminus'
import { DbQueryService } from '@pooling-poc/db-query'

@Controller('health')
export class HealthController {
    constructor(
        private health: HealthCheckService,
        private http: HttpHealthIndicator,
        private dbQueryService: DbQueryService,
    ) { }

    @Get()
    @HealthCheck()
    check() {
        return this.health.check([
            () => this.http.pingCheck('self', `http://localhost:${process.env.POOLED_APP_PORT ?? 3000}/health`),
            async () => {
                await this.dbQueryService.ping()
                return { db: { status: 'up' } }
            },
        ])
    }
}
