import { execute } from 'test-a-bit'

import { WS_PORT, WS_URL } from './_helpers.js'
import { WseError } from '../src/common.js'
import { WseServer } from '../src/server.js'
import { WseClient } from '../src/client.js'

// Every other failure path produces a WseError, but a close-driven rejection
// rejects with String(event.reason) — callers get no .code and no stack.
execute('case: connect must reject with a WseError', async (success, fail) => {
  const server = new WseServer({ port: WS_PORT, identify: ({ refuse }) => refuse() })
  const client = new WseClient({ url: WS_URL })

  try {
    await client.connect('bad-token')
    fail('connect resolved for a refused client')
  } catch (e) {
    e instanceof WseError
        ? success(`rejected with WseError (${ e.code })`)
        : fail(`rejected with ${ typeof e } "${ e }" instead of a WseError`)
  }
})
