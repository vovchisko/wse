import { execute } from 'test-a-bit'

import { identify, SECRET, WS_PORT, WS_URL } from './_helpers.js'
import { WseServer } from '../src/server.js'
import { WseClient } from '../src/client.js'
import { WSE_ERROR } from '../node.js'

execute('rp throw vanilla', async (success, fail) => {
  const server = new WseServer({ port: WS_PORT, identify })
  const client = new WseClient({ url: WS_URL })

  server.register('test-rp-custom', () => {
    throw new Error('Vanilla error')
  })

  await client.connect(SECRET, { client_meta: 1 })

  try {
    await client.call('test-rp-custom', { value: 1 })
    fail('no errors!')
  } catch (e) {
    if (e.code === WSE_ERROR.RP_EXECUTION_FAILED) {
      success(`correct error ${e.code}`)
    } else {
      fail(`invalid error code ${e}`)
    }
  }
})
