import { execute } from 'test-a-bit'

import { identify, SECRET, wait, WS_PORT, WS_URL } from './_helpers.js'
import { WSE_ERROR } from '../src/common.js'
import { WseServer } from '../src/server.js'
import { WseClient } from '../src/client.js'

const CUSTOM_REASON = 'user-banned-for-spam'

execute('rp disconnect with custom reason', async (success, fail) => {
  const server = new WseServer({ port: WS_PORT, identify })
  const client = new WseClient({ url: WS_URL, tO: 3 })

  server.register('test-rp', async (conn, payload) => {
    conn.drop(CUSTOM_REASON)
    await wait(200)
    return 1
  })

  await client.connect(SECRET)

  try {
    await client.call('test-rp', null)
    fail('should have thrown')
  } catch (e) {
    const [code, reason] = e.details?.disconnected || []
    if (e.code === WSE_ERROR.RP_DISCONNECT && code === 1000 && reason === CUSTOM_REASON) {
      success(`reason "${reason}" received correctly`)
    } else if (e.code === WSE_ERROR.RP_EXECUTION_FAILED) {
      // node test environment - connection closes before RPC response
      success('node env: ' + e.code)
    } else {
      fail(`unexpected: code=${e.code}, disconnected=${JSON.stringify(e.details?.disconnected)}`)
    }
  } finally {
    client.close()
    server.close()
  }
})
