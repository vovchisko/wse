import { execute } from 'test-a-bit'

import { VALID_SECRET, WS_TEST_PORT } from './_helpers.js'
import { WseClient, WseServer }       from '../node.js'

execute('cra-challenge connect and ready', async (success, fail) => {
  const options = {}

  function identify ({ payload, resolve, meta, challenge }) {
    if (payload === VALID_SECRET && challenge.response === 42) {
      const user_id = meta.user_id || 'USR-1'
      resolve(user_id)
    } else {
      resolve(false)
    }
  }

  const server = new WseServer({ port: WS_TEST_PORT, identify, ...options })
  const client = new WseClient({ url: `ws://localhost:${ WS_TEST_PORT }`, ...options })

  server.useChallenge((payload, meta, challenge) => {
    challenge({ a: 41, b: 1 })
  })

  client.challenge((challenge, solve) => {
    solve(challenge.a - challenge.b) // clearly wrong answer
  })

  client.when.ready(welcome_data => {
    fail('welcome message received')
  })

  try {
    await client.connect(VALID_SECRET, { user_id: 1 })
    fail('client still passed')
  } catch (e) {
    success('dropped on challenge failure')
  }
})




