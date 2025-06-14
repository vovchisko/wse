import { execute } from 'test-a-bit'

import { identify, SECRET, wait, WS_PORT, WS_URL } from './_helpers.js'
import { WSE_ERROR } from '../src/common.js'
import { WseServer } from '../src/server.js'
import { WseClient } from '../src/client.js'

execute('rp timeout', async (success, fail) => {
  const server = new WseServer({ port: WS_PORT, identify })
  const client = new WseClient({ url: WS_URL, tO: 0.1 })

  server.register('test-rp', async (conn, payload) => {
    await wait(60000)
    return 1
  })

  await client.connect(SECRET)

  try {
    await client.call('test-rp', null)
    fail('still responds')
  } catch (e) {
    if (e.code === WSE_ERROR.RP_TIMEOUT) {
      success(`correct error ${e.code}`)
    } else {
      fail(`incorrect error type ${e}`)
    }
  }
})
