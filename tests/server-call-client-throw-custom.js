import { execute } from 'test-a-bit'

import { identify, SECRET, WS_PORT, WS_URL } from './_helpers.js'
import { WseServer } from '../src/server.js'
import { WseClient } from '../src/client.js'

execute('server call client throw custom', async (success, fail) => {
  const server = new WseServer({ port: WS_PORT, identify })
  const client = new WseClient({ url: WS_URL })

  client.register('test-rp-custom', () => {
    throw { test_field: 'nope' }
  })

  server.when.connected(async (conn) => {
    try {
      await conn.call('test-rp-custom', { value: 1 })
      fail('no errors!')
    } catch (e) {
      if (e.details.test_field === 'nope') {
        success('correct details on error')
      } else {
        fail(`invalid error code ${e}`)
      }
    }
  })

  await client.connect(SECRET, { client_meta: 1 })
}) 