import { execute } from 'test-a-bit'

import { VALID_SECRET, WS_TEST_PORT } from './_helpers.js'
import { WseClient, WseServer }       from '../node.js'

function incoming ({ payload, resolve, meta, challenge }) {
  if (payload === VALID_SECRET) {
    const user_id = meta.user_id || 'USR-1'

    if (challenge) {
      console.log(challenge)
    }

    resolve(user_id, { hey: 'some additional data for the client' })

  } else {
    resolve(false)
  }
}

execute('connect and ready', async (success, fail) => {
  const options = {}

  const server = new WseServer({ port: WS_TEST_PORT, incoming, ...options })
  const client = new WseClient({ url: `ws://localhost:${ WS_TEST_PORT }`, ...options })

  if (!process.send) client.logger = (args) => console.log('CLIENT::', ...args)
  if (!process.send) server.logger = (args) => console.log('SERVER::', ...args)

  server.use_challenge((payload, meta, challenge)=>{
    server.log('challenge generated!', payload)
    challenge({ a: 1, b: 2 })
  })

  server.init()

  client.solve_challenge = (challenge, solve) => {
    client.log('solve_challenge', challenge)
    solve({ result: challenge.a + challenge.b })
  }

  client.ready.on(welcome_data => {
    server.log('very welcomed', welcome_data)
    success('welcome message received')
  })

  console.log('connecting...')
  await client.connect(VALID_SECRET, { user_id: 1 })
  console.log('CONNECTED!')
})




