import { execute } from 'test-a-bit'

import { identify, SECRET, wait, WS_PORT, WS_URL } from './_helpers.js'
import { WseServer } from '../src/server.js'
import { WseClient } from '../src/client.js'

execute('rp call', async (success, fail) => {
  const server = new WseServer({ port: WS_PORT, identify })
  const client = new WseClient({ url: WS_URL })

  server.register('test-rp', async (conn, payload) => {
    await wait(100)
    return payload.value * 2
  })

  await client.connect(SECRET, { client_meta: 1 })
  try {
    const res = await client.call('test-rp', { value: 21 })
    if (res === 42) success('42 is correct response from rp')
  } catch (e) {
    fail(`failed to call rp ${e}`)
  }
})
