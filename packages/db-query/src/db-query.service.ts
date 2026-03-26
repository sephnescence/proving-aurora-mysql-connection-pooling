import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import * as mysql from 'mysql2/promise'
import { ProcesslistRow } from './processlist-row.interface'

const QUERY =
  'SELECT ID, USER, HOST, DB, COMMAND, TIME, STATE, INFO FROM information_schema.processlist'

function buildConnectionConfig(): mysql.ConnectionOptions {
  const config: mysql.ConnectionOptions = {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  }
  if (process.env.DB_SSL === 'true') {
    config.ssl = { rejectUnauthorized: false }
  }
  return config
}

@Injectable()
export class DbQueryService implements OnModuleInit, OnModuleDestroy {
  private connection: mysql.Connection | null = null
  private readonly mode: string

  constructor(
    @InjectPinoLogger(DbQueryService.name)
    private readonly logger: PinoLogger,
  ) {
    this.mode = process.env.DB_CONNECTION_MODE ?? 'per-request'
  }

  async onModuleInit(): Promise<void> {
    if (this.mode === 'persistent') {
      try {
        this.connection = await mysql.createConnection(buildConnectionConfig())
      } catch (err) {
        this.logger.warn({ err }, 'db_connect_failed_on_init')
      }
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.connection) {
      await this.connection.end()
      this.connection = null
    }
  }

  async processlist(testType: string): Promise<ProcesslistRow[]> {
    if (this.mode === 'persistent') {
      if (!this.connection) {
        this.connection = await mysql.createConnection(buildConnectionConfig())
      }
      const [rows] = await this.connection.execute<mysql.RowDataPacket[]>(QUERY)
      const result = rows as ProcesslistRow[]
      this.logger.info(
        { testType, rowCount: result.length, rows: result },
        'processlist_result',
      )
      return result
    }

    const conn = await mysql.createConnection(buildConnectionConfig())
    try {
      const [rows] = await conn.execute<mysql.RowDataPacket[]>(QUERY)
      const result = rows as ProcesslistRow[]
      this.logger.info(
        { testType, rowCount: result.length, rows: result },
        'processlist_result',
      )
      return result
    } finally {
      await conn.end()
    }
  }

  async ping(): Promise<void> {
    const conn = await mysql.createConnection(buildConnectionConfig())
    try {
      await conn.ping()
    } finally {
      await conn.end()
    }
  }
}
