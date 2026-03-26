import { describe, it, expect } from 'vitest'

// These tests currently expect 500 because no database is configured in the
// local development environment at this stage of the build. Once Docker Compose
// is set up (step-00038) and .env is configured (step-00039), these will be
// updated to expect 200 with real processlist data (step-00039b).
const POOLED_URL = 'http://localhost:3000/processlist'
const UNPOOLED_URL = 'http://localhost:3001/processlist'
const HEADERS = { 'X-Test-Type': 'integration' }

async function fetchProcesslist(url: string) {
  const res = await fetch(url, { headers: HEADERS })
  return { status: res.status, body: await res.json() }
}

describe('pooled-app /processlist', () => {
  it('returns 500 when no database is configured', async () => {
    const { status } = await fetchProcesslist(POOLED_URL)
    expect(status).toBe(500)
  })
})

describe('unpooled-app /processlist', () => {
  it('returns 500 when no database is configured', async () => {
    const { status } = await fetchProcesslist(UNPOOLED_URL)
    expect(status).toBe(500)
  })
})
