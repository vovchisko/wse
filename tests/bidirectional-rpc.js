import { execute } from 'test-a-bit'
import { identify, SECRET, WS_PORT, WS_URL } from './_helpers.js'
import { WseServer } from '../src/server.js'
import { WseClient } from '../src/client.js'

execute('bidirectional RPC', async (success, fail) => {
  const server = new WseServer({ port: WS_PORT, identify })
  const client = new WseClient({ url: WS_URL })

  // Register RPC on client
  client.register('ping', () => 'pong')

  // Register RPC on server
  server.register('add', (conn, payload) => payload.a + payload.b)

  server.when.connected(async conn => {
    try {
      // Test server calling client RPC
      const pingResult = await conn.call('ping')
      if (pingResult !== 'pong') {
        fail(`expected 'pong', got '${pingResult}'`)
        return
      }
      success('bidirectional RPC works')
    } catch (e) {
      fail(`RPC failed: ${e.message}`)
    }
  })

  await client.connect(SECRET)

  try {
    // Test client calling server RPC
    const addResult = await client.call('add', { a: 5, b: 3 })
    if (addResult !== 8) {
      fail(`expected 8, got ${addResult}`)
    }
  } catch (e) {
    fail(`RPC failed: ${e.message}`)
  }
})
