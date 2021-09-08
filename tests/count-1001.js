import { execute } from 'test-a-bit'

import { identify, SECRET, WS_PORT, WS_URL } from './_helpers.js'
import { WseServer }                         from '../src/server.js'
import { WseClient }                         from '../src/client.js'

execute('count together to 1001', async (success, fail) => {
  const server = new WseServer({ port: WS_PORT, identify })
  const client = new WseClient({ url: WS_URL })

  let server_var = 0
  server.channel.on('count', (conn, payload) => {
    if (payload.count >= 1001) return success(`${ payload.count }!`)

    server_var = payload.count
    server_var += 1
    conn.send('count', { count: server_var })
  })

  let client_var = 0
  client.channel.on('count', (payload) => {
    client_var = payload.count
    client_var += 1
    client.send('count', { count: client_var })
  })

  await client.connect(SECRET)
  client.send('count', { client_var })
})
