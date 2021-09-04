import { execute } from 'test-a-bit'

import { SECRET, WS_PORT, WS_URL } from './_helpers.js'
import { WseServer }               from '../src/server.js'
import { WseClient }               from '../src/client.js'

execute('cra-challenge connect and ready', async (success, fail) => {

  function identifyWithCra ({ identity, resolve, meta, challenge }) {
    if (identity === SECRET && challenge.response === 42) {
      const user_id = meta.user_id || 'USR-1'
      resolve(user_id)
    } else {
      resolve(false)
    }
  }

  const server = new WseServer({ port: WS_PORT, identify: identifyWithCra })
  const client = new WseClient({ url: WS_URL })

  server.useChallenge((identity, meta, quest) => {
    quest({ a: 41, b: 1 })
  })

  client.challenge((challenge, solve) => {
    solve(challenge.a - challenge.b) // clearly wrong answer
  })

  client.when.ready(payload => fail('welcome message received'))

  try {
    await client.connect(SECRET, { user_id: 1 })
    fail('client still passed')
  } catch (e) {
    success('dropped on challenge failure')
  }
})




