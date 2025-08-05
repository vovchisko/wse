import { execute } from 'test-a-bit'

import { identify, SECRET, wait, WS_PORT, WS_URL } from './_helpers.js'
import { WseServer } from '../src/server.js'
import { WseClient } from '../src/client.js'

execute('server call client', async (success, fail) => {
  const server = new WseServer({ port: WS_PORT, identify })
  const client = new WseClient({ url: WS_URL })

  client.register('test-rp', async payload => {
    await wait(100)
    return payload.value * 2
  })

  server.when.connected(async conn => {
    try {
      const res = await conn.call('test-rp', { value: 21 })
      if (res === 42) success('42 is correct response from client rp')
      else fail(`expected 42, got ${res}`)
    } catch (e) {
      fail(`failed to call client rp ${e}`)
    }
  })

  await client.connect(SECRET, { client_meta: 1 })
})
