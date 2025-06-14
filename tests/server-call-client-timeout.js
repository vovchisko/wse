import { execute } from 'test-a-bit'

import { identify, SECRET, wait, WS_PORT, WS_URL } from './_helpers.js'
import { WSE_ERROR } from '../src/common.js'
import { WseServer } from '../src/server.js'
import { WseClient } from '../src/client.js'

execute('server call client timeout', async (success, fail) => {
  const server = new WseServer({ port: WS_PORT, identify, tO: 0.1 })
  const client = new WseClient({ url: WS_URL })

  client.register('test-rp', async (payload) => {
    await wait(60000)
    return 1
  })

  server.when.connected(async (conn) => {
    try {
      await conn.call('test-rp', null)
      fail('still responds')
    } catch (e) {
      if (e.code === WSE_ERROR.RP_TIMEOUT) {
        success(`correct error ${e.code}`)
      } else {
        fail(`incorrect error type ${e}`)
      }
    }
  })

  await client.connect(SECRET)
}) 