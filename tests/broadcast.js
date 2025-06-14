import { execute } from 'test-a-bit'

import { identify, SECRET, WS_PORT, WS_URL } from './_helpers.js'
import { WseServer } from '../src/server.js'
import { WseClient } from '../src/client.js'

execute('only one connection per client', async (success, fail) => {
  const server = new WseServer({ port: WS_PORT, identify })

  const client1 = new WseClient({ url: WS_URL })
  const client2 = new WseClient({ url: WS_URL })
  const client3 = new WseClient({ url: WS_URL })
  const client4 = new WseClient({ url: WS_URL })

  const result = []
  const check_result = () => {
    if (result.length === 4) {
      result.forEach(val => (val !== '42' ? fail('broadcast failed') : null))
      success('broadcast is correct')
    }
  }

  client1.channel.on('broad-message', payload => {
    result.push(payload.test)
    check_result()
  })

  client2.channel.on('broad-message', payload => {
    result.push(payload.test)
    check_result()
  })

  client3.channel.on('broad-message', payload => {
    result.push(payload.test)
    check_result()
  })

  client4.channel.on('broad-message', payload => {
    result.push(payload.test)
    check_result()
  })

  await client1.connect(SECRET, { user_id: 'UID1' })
  await client2.connect(SECRET, { user_id: 'UID2' })
  await client3.connect(SECRET, { user_id: 'UID3' })
  await client4.connect(SECRET, { user_id: 'UID4' })

  server.broadcast('broad-message', { test: '42' })
})
