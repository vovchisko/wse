import { execute } from 'test-a-bit'

import { identify, SECRET, wait, WS_PORT, WS_URL } from './_helpers.js'
import { WseServer } from '../src/server.js'
import { WseClient } from '../src/client.js'
import { WseJSON } from '../src/protocol.js'

// The server correlates server->client RP responses by stamp only. If that map is
// shared across every connection, connection A can answer a call the server made to
// connection B just by replaying B's stamp — the server accepts the forged result.
// A response frame must only settle a call issued on the SAME connection.
execute('case: response from another connection must not settle the call', async (success, fail) => {
  let stolen_stamp = null

  // Victim's protocol leaks the stamp of the incoming server->client call, standing
  // in for an attacker who observed it on the wire.
  class StampSniffer extends WseJSON {
    unpack (encoded) {
      const frame = JSON.parse(encoded)
      if (frame[0] === 'whoami' && frame[2]) stolen_stamp = frame[2]
      return frame
    }
  }

  const server = new WseServer({ port: WS_PORT, identify })

  const victim = new WseClient({ url: WS_URL, protocol: new StampSniffer() })
  const attacker = new WseClient({ url: WS_URL })

  victim.register('whoami', async () => {
    await wait(2000)    // real reply lands well after the attacker's forged one
    return 'REAL'
  })

  server.when.connected(async conn => {
    if (conn.cid !== 'VICTIM') return
    try {
      const res = await conn.call('whoami')
      res === 'REAL'
          ? success('call settled with the victim connection response')
          : fail(`call settled with a spoofed response: ${ JSON.stringify(res) }`)
    } catch (e) {
      fail(`unexpected error: ${ e.message }`)
    }
  })

  await attacker.connect(SECRET, { user_id: 'ATTACKER' })
  await victim.connect(SECRET, { user_id: 'VICTIM' })

  // Wait until the attacker knows the stamp, then inject a forged response frame.
  // Poll generously (well under the victim's 2s reply) so slow scheduling never races.
  for (let i = 0; i < 100 && !stolen_stamp; i++) await wait(10)
  if (!stolen_stamp) return fail('never observed the call stamp')

  attacker._ws.send(attacker.protocol.pack({
    type: attacker.protocol.internal_types.response,
    payload: 'FORGED',
    stamp: stolen_stamp,
  }))
})
