import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Test } from '@nestjs/testing'
import { getLoggerToken } from 'nestjs-pino'
import { DbQueryService } from './db-query.service'
import { ProcesslistRow } from './processlist-row.interface'
import * as mysql from 'mysql2/promise'

vi.mock('mysql2/promise')

const mockRows: ProcesslistRow[] = [
  {
    ID: 1,
    USER: 'admin',
    HOST: 'localhost',
    DB: 'pooling_poc',
    COMMAND: 'Query',
    TIME: 0,
    STATE: null,
    INFO: null,
  },
]

function buildMockConn(rows: ProcesslistRow[]) {
  return {
    execute: vi.fn().mockResolvedValue([rows]),
    end: vi.fn().mockResolvedValue(undefined),
    ping: vi.fn().mockResolvedValue(undefined),
  }
}

describe('DbQueryService', () => {
  let service: DbQueryService
  let mockLogger: {
    info: ReturnType<typeof vi.fn>
    error: ReturnType<typeof vi.fn>
  }

  beforeEach(async () => {
    vi.resetAllMocks()
    process.env.DB_CONNECTION_MODE = 'per-request'

    mockLogger = { info: vi.fn(), error: vi.fn() }

    const module = await Test.createTestingModule({
      providers: [
        DbQueryService,
        {
          provide: getLoggerToken(DbQueryService.name),
          useValue: mockLogger,
        },
      ],
    }).compile()

    service = module.get(DbQueryService)
  })

  it('returns rows and logs processlist_result on happy path', async () => {
    const mockConn = buildMockConn(mockRows)
    vi.mocked(mysql.createConnection).mockResolvedValue(mockConn as any)

    const result = await service.processlist('sequential')

    expect(result).toEqual(mockRows)
    expect(mockLogger.info).toHaveBeenCalledWith(
      { testType: 'sequential', rowCount: 1, rows: mockRows },
      'processlist_result',
    )
  })

  it('returns empty array and logs when mysql returns no rows', async () => {
    const mockConn = buildMockConn([])
    vi.mocked(mysql.createConnection).mockResolvedValue(mockConn as any)

    const result = await service.processlist('concurrent')

    expect(result).toEqual([])
    expect(mockLogger.info).toHaveBeenCalledWith(
      { testType: 'concurrent', rowCount: 0, rows: [] },
      'processlist_result',
    )
  })

  it('propagates error thrown by mysql', async () => {
    vi.mocked(mysql.createConnection).mockRejectedValue(
      new Error('connection refused'),
    )

    await expect(service.processlist('sequential')).rejects.toThrow(
      'connection refused',
    )
  })
})
