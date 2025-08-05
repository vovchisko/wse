import { execute } from 'test-a-bit'

import { WS_PORT } from './_helpers.js'
import { WseServer } from '../src/server.js'
import { WseClient } from '../src/client.js'

execute('jump between servers', async (success, fail) => {
  const A = { name: 'server1', url: `ws://localhost:${WS_PORT}`, port: WS_PORT }
  const B = { name: 'server2', url: `ws://localhost:${WS_PORT + 1}`, port: WS_PORT + 1 }

  const serverA = new WseServer({
    port: A.port,
    identify: ({ accept }) => accept('server1-user', A.name),
  })
  const serverB = new WseServer({
    port: B.port,
    identify: ({ accept }) => accept('server2-user', B.name),
  })

  const client = new WseClient({ url: A.url })

  // Connect to first server
  const welcome1 = await client.connect()
  // Jump to second server
  const welcome2 = await client.jump(B.url)
  // Jump back to first server
  const welcome3 = await client.jump(A.url)

  if (welcome1 === 'server1' && welcome2 === 'server2' && welcome3 === 'server1') {
    success('jump between servers works')
  } else {
    fail(`wrong welcome messages: [${welcome1}, ${welcome2}, ${welcome3}]`)
  }

  client.close()
})
