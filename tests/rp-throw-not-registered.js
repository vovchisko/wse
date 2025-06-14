import { execute } from 'test-a-bit'

import { identify, SECRET, WS_PORT, WS_URL } from './_helpers.js'
import { WSE_ERROR } from '../src/common.js'
import { WseServer } from '../src/server.js'
import { WseClient } from '../src/client.js'

execute('rp not registered', async (success, fail) => {
  const server = new WseServer({ port: WS_PORT, identify })
  const client = new WseClient({ url: WS_URL })

  await client.connect(SECRET, { client_meta: 1 })

  try {
    await client.call('no-existing-rp')
  } catch (e) {
    if (e.code === WSE_ERROR.RP_NOT_REGISTERED) {
      success(e.code)
    } else {
      fail(`invalid error code ${e}`)
    }
  }
})
