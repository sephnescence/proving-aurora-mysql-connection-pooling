import {
  CloudWatchLogsClient,
  StartQueryCommand,
  GetQueryResultsCommand,
  QueryStatus,
} from '@aws-sdk/client-cloudwatch-logs'

const args = process.argv.slice(2)
function getArg(name: string): string {
  const idx = args.indexOf(`--${name}`)
  if (idx === -1 || !args[idx + 1]) {
    console.error(`Missing required argument: --${name}`)
    process.exit(1)
  }
  return args[idx + 1]
}

const testType = getArg('testType')
const startTime = Number(getArg('startTime'))
const pooledLogGroup = getArg('pooledLogGroup')
const unpooledLogGroup = getArg('unpooledLogGroup')

const REGION = 'ap-southeast-2'
const POLL_INTERVAL_MS = 30_000
const POLL_DURATION_MS = 5 * 60 * 1000
const END_TIME = Date.now()

const client = new CloudWatchLogsClient({ region: REGION })

const QUERY_STRING = `
fields @timestamp, testType, rowCount, rows
| filter testType = "${testType}"
| sort @timestamp desc
| limit 50
`.trim()

async function runQuery(
  logGroupName: string,
): Promise<{ timestamp: string; rowCount: string }[]> {
  const start = await client.send(
    new StartQueryCommand({
      logGroupName,
      startTime: Math.floor(startTime / 1000),
      endTime: Math.floor(END_TIME / 1000),
      queryString: QUERY_STRING,
    }),
  )

  const queryId = start.queryId!
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 1500))
    const result = await client.send(new GetQueryResultsCommand({ queryId }))
    if (
      result.status === QueryStatus.Complete ||
      result.status === QueryStatus.Failed ||
      result.status === QueryStatus.Cancelled
    ) {
      if (result.status !== QueryStatus.Complete) return []
      return (result.results ?? []).map((row) => {
        const get = (f: string) => row.find((c) => c.field === f)?.value ?? ''
        return { timestamp: get('@timestamp'), rowCount: get('rowCount') }
      })
    }
  }
  return []
}

function average(rows: { rowCount: string }[]): string {
  if (rows.length === 0) return 'N/A'
  const sum = rows.reduce((acc, r) => acc + Number(r.rowCount), 0)
  return (sum / rows.length).toFixed(2)
}

async function poll() {
  const deadline = Date.now() + POLL_DURATION_MS
  let iteration = 0

  while (Date.now() < deadline) {
    iteration++
    console.log(`\n=== Poll iteration ${iteration} ===`)

    for (const [label, logGroup] of [
      ['pooled', pooledLogGroup],
      ['unpooled', unpooledLogGroup],
    ] as const) {
      const rows = await runQuery(logGroup)
      console.log(
        `\n[${label}] ${rows.length} log entries — avg rowCount: ${average(rows)}`,
      )
      if (rows.length > 0) {
        console.table(rows)
      }
    }

    if (Date.now() + POLL_INTERVAL_MS < deadline) {
      console.log(`\nWaiting ${POLL_INTERVAL_MS / 1000}s before next poll...`)
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
    }
  }

  console.log('\nPolling complete.')
}

poll().catch((err) => {
  console.error(err)
  process.exit(1)
})
