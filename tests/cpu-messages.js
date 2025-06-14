import { execute } from 'test-a-bit'

import { identify, SECRET, WS_PORT, WS_URL } from './_helpers.js'
import { WseServer } from '../src/server.js'
import { WseClient } from '../src/client.js'

execute('cpu limit 3 - messages', async (success, fail) => {
  const server = new WseServer({ port: WS_PORT, identify, connPerUser: 3 })

  const clientA = new WseClient({ url: WS_URL })
  const clientB = new WseClient({ url: WS_URL })
  const clientC = new WseClient({ url: WS_URL })

  const received = { A: 0, B: 0, C: 0 }

  const check_messages = () => {
    if (received.A === 1 && received.B === 1 && received.C === 1) {
      success('all clients received the message once')
    }
  }

  clientA.channel.on('msg', payload => {
    if (received.A) fail('message received more that once on client A')
    received.A++
    check_messages()
  })

  clientB.channel.on('msg', payload => {
    if (received.B) fail('message received more that once on client B')
    received.B++
    check_messages()
  })

  clientC.channel.on('msg', payload => {
    if (received.C) fail('message received more that once on client C')
    received.C++
    check_messages()
  })

  await clientA.connect(SECRET, { user_id: 'UID1' })
  await clientB.connect(SECRET, { user_id: 'UID1' })
  await clientC.connect(SECRET, { user_id: 'UID1' })

  setTimeout(() => server.send('UID1', 'msg', { hey: 'there' }), 200)
})
