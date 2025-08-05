import { execute } from 'test-a-bit'

import { identify, SECRET, WS_PORT, WS_URL } from './_helpers.js'
import { WseServer } from '../src/server.js'
import { WseClient } from '../src/client.js'

// Custom protocol that adds a prefix to JSON messages
class WseCustomProtocol {
  constructor() {
    this.name = 'wse-default-json'
    this.internal_types = Object.freeze({
      hi: '~wse:hi',
      challenge: '~wse:challenge',
      welcome: '~wse:welcome',
      call: '~wse:call',
      response: '~wse:response',
      response_error: '~wse:response-err',
    })
  }

  pack({ type, payload = undefined, stamp = undefined }) {
    const jsonData = JSON.stringify([type, payload, stamp])
    return 'CUSTOM:' + jsonData
  }

  unpack(encoded) {
    if (typeof encoded !== 'string') {
      // Handle Buffer or other types
      encoded = encoded.toString()
    }

    if (!encoded.startsWith('CUSTOM:')) {
      throw new Error('Invalid custom protocol format')
    }
    const jsonData = encoded.substring(7) // Remove 'CUSTOM:' prefix
    return JSON.parse(jsonData)
  }
}

execute('custom protocol', async (success, fail) => {
  const serverProtocol = new WseCustomProtocol()
  const clientProtocol = new WseCustomProtocol()
  const server = new WseServer({ port: WS_PORT, identify, protocol: serverProtocol })
  const client = new WseClient({ url: WS_URL, protocol: clientProtocol })

  client.register('test-rp', payload => {
    return payload.value * 2
  })

  client.channel.on('test-message', payload => {
    if (payload.value === 42) {
      success('custom protocol works for messages and RPCs')
    } else {
      fail('invalid data from server')
    }
  })

  server.when.connected(async conn => {
    try {
      const result = await conn.call('test-rp', { value: 21 })
      if (result === 42) {
        conn.send('test-message', { value: 42 })
      } else {
        fail(`expected 42, got ${result}`)
      }
    } catch (e) {
      fail(`RPC failed: ${e}`)
    }
  })

  await client.connect(SECRET, { client_meta: 1 })
})
