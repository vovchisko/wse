import { execute } from 'test-a-bit'

import { create_clients_swarm, create_server, VALID_SECRET } from './_helpers.js'

execute('swarm connect', async (success, fail) => {

  const total_clients = 20
  let points = 0

  const server = create_server()
  const clients = create_clients_swarm(total_clients)

  server.joined.on(c => {
    server.log('joined', c.id)
    points++
    if (points === total_clients) {
      success(`all ${ points } users connected`)
    }
  })

  for (let i = 0; i < clients.length; i++) {
    clients[i].connect(VALID_SECRET, { index: i })
  }
})

