import { execute } from 'test-a-bit'

import { identify, SECRET, WS_PORT, WS_URL } from './_helpers.js'
import { WseServer } from '../src/server.js'
import { WseClient } from '../src/client.js'

// broadcast() must serialize the frame once and reuse it for every connection,
// not call pack() once per recipient.
class CountingProtocol {
  constructor () {
    this.name = 'wse-default-json'
    this.internal_types = Object.freeze({
      hi: '~wse:hi',
      challenge: '~wse:challenge',
      welcome: '~wse:welcome',
      call: '~wse:call',
      response: '~wse:response',
      response_error: '~wse:response-err',
    })
    this.broadPacks = 0
  }

  pack ({ type, payload = undefined, stamp = undefined }) {
    if (type === 'broad') this.broadPacks++
    return JSON.stringify([ type, payload, stamp ])
  }

  unpack (encoded) {
    return JSON.parse(encoded)
  }
}

execute('broadcast serializes once', async (success, fail) => {
  const protocol = new CountingProtocol()
  const server = new WseServer({ port: WS_PORT, identify, protocol })

  const clients = []
  let received = 0

  for (let i = 0; i < 4; i++) {
    const c = new WseClient({ url: WS_URL })
    c.channel.on('broad', () => {
      if (++received === 4) {
        protocol.broadPacks === 1
            ? success('broadcast packed exactly once for 4 clients')
            : fail(`expected 1 pack, got ${ protocol.broadPacks }`)
      }
    })
    clients.push(c)
  }

  await Promise.all(clients.map((c, i) => c.connect(SECRET, { user_id: 'U' + i })))

  server.broadcast('broad', { test: 1 })
})
