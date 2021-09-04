import { execute } from 'test-a-bit'

import { create_clients_swarm, create_server, VALID_SECRET } from './_helpers.js'

execute('swarm disconnect', async (success, fail) => {

  const total_clients = 20
  let points = 0

  const server = create_server()
  const clients = create_clients_swarm(total_clients)

  server.when.joined(c => {
    process.nextTick(() => {
      c.drop('BECAUSE-OF-TEST')
    })
  })

  for (let i = 0; i < clients.length; i++) {
    clients[i].connect(VALID_SECRET, { index: i })
    clients[i].closed.on((code, reason) => {
      if (code === 1000 && reason === 'BECAUSE-OF-TEST') {
        points++
        if (points === total_clients) {
          success(`all ${ points } users disconnected`)
        }
      } else {
        fail('invalid reason catch')
      }
    })
  }
})




