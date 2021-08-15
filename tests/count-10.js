import { execute } from 'test-a-bit'

import { create_pair, VALID_SECRET } from './_helpers.js'

execute('count together to 10', async (success, fail) => {
  const { server, client } = create_pair()

  let server_var = 0
  server.channel.on('count', (c, dat) => {
    server_var = dat.count
    server_var += 1
    c.send('count', { count: server_var })
  })

  let client_var = 0
  client.channel.on('count', (dat) => {
    if (dat.count >= 10) return success(`${ dat.count }!`)

    client_var = dat.count
    client_var += 1
    client.send('count', { count: client_var })
  })

  await client.connect(VALID_SECRET)
  client.send('count', client_var)
})
