import { execute } from 'test-a-bit'

import { SECRET, WS_PORT, WS_URL } from './_helpers.js'
import { WseServer }               from '../src/server.js'
import { WseClient }               from '../src/client.js'

execute('cra-challenge fail halfway', async (success, fail) => {

  function identifyWithCra ({ identity, accept, refuse, meta, challenge }) {
    if (identity === SECRET && challenge.response === 42) {
      const user_id = meta.user_id || 'USR-1'
      accept(user_id)
    } else {
      refuse()
    }
  }

  const server = new WseServer({ port: WS_PORT, identify: identifyWithCra })
  const client = new WseClient({ url: WS_URL })

  // todo: make it also object-like argument
  server.useChallenge((identity, meta, quest, refuse) => {
    refuse()
  })

  client.challenge((challenge, solve) => {
    fail('challenge should not happend on the client')
  })

  client.when.ready(payload => fail('welcome message received'))

  try {
    await client.connect(SECRET, { user_id: 1 })
    fail('client still passed')
  } catch (e) {
    success('dropped on halfway')
  }
})




