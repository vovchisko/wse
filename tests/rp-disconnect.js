import { execute } from 'test-a-bit'

import { identify, SECRET, wait, WS_PORT, WS_URL } from './_helpers.js'
import { WSE_ERROR }                               from '../src/common.js'
import { WseServer }                               from '../src/server.js'
import { WseClient }                               from '../src/client.js'

execute('rp timeout', async (success, fail) => {
  const server = new WseServer({ port: WS_PORT, identify })
  const client = new WseClient({ url: WS_URL, tO: 3 })

  server.register('test-rp', async (conn, payload) => {
    conn.drop()
    await wait(200)
    return 1
  })

  await client.connect(SECRET)

  try {
    await client.call('test-rp', null)
    client.close()
    fail('still responds')
  } catch (e) {
    if ([
      WSE_ERROR.RP_DISCONNECT, // only correct answer for the browser
      WSE_ERROR.RP_EXECUTION_REJECTED, // node (in test)
      WSE_ERROR.RP_EXECUTION_FAILED, // node (in test)
    ].includes(e.code)) {
      success('mostly correct err: ' + e.code)
    } else {
      fail('incorrect error code ' + e.code)
    }
  }
})
