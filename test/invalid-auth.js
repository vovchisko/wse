import { execute } from './_execute.js'

import { create_pair, INVALID_SECRET } from './_helpers.js'
import { WSE_REASON }                  from '../node.js'

execute('unauthorised connection', async (success, fail) => {
  const { server, client } = create_pair()

  server.init()

  client.closed.on((code, reason) => {
    code === 1000 && reason === WSE_REASON.NOT_AUTHORIZED
        ? success('reason ' + WSE_REASON.NOT_AUTHORIZED)
        : fail('invalid close reason')
  })

  try {
    await client.connect(INVALID_SECRET)
  } catch (err) {
    fail('error in try-catch')
    console.err(err.reason)
  }
})




