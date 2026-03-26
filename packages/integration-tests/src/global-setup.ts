import { exec } from 'child_process'
import { promisify } from 'util'
import * as path from 'path'

const execAsync = promisify(exec)

// vitest runs with cwd set to the package directory (packages/integration-tests)
const REPO_ROOT = path.resolve(process.cwd(), '../..')

const POOLED_HEALTH_URL = 'http://localhost:3000/health'
const UNPOOLED_HEALTH_URL = 'http://localhost:3001/health'
const HEALTH_TIMEOUT_MS = 120_000
const POLL_INTERVAL_MS = 3_000

async function waitForHealth(url: string): Promise<void> {
  const deadline = Date.now() + HEALTH_TIMEOUT_MS
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url)
      if (res.ok) return
    } catch {
      // app not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
  }
  throw new Error(`Timed out after ${HEALTH_TIMEOUT_MS}ms waiting for ${url}`)
}

export async function setup(): Promise<void> {
  await execAsync('docker-compose up --build -d', {
    cwd: REPO_ROOT,
    timeout: 300_000,
  })
  await Promise.all([
    waitForHealth(POOLED_HEALTH_URL),
    waitForHealth(UNPOOLED_HEALTH_URL),
  ])
}

export async function teardown(): Promise<void> {
  await execAsync('docker-compose down', { cwd: REPO_ROOT })
}
