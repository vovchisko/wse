import { execute } from 'test-a-bit'

import { SECRET, wait, WS_PORT, WS_URL } from './_helpers.js'
import { WseServer } from '../src/server.js'
import { WseClient } from '../src/client.js'

// _identify_connection emits `joined` with `payload.meta || {}`, but in the
// CRA flow `payload` is the challenge solution, not the `hi` frame. Solving with
// null (or undefined, which serializes to null) throws a TypeError inside accept(),
// so `connected` never fires and the conn is dropped as a protocol error.
// Even with a non-null solution the meta is wrong: `joined` gets {} instead of the
// client's real meta. Both go away by emitting conn.meta.
execute('case: cra with a null solution must accept cleanly', async (success, fail) => {
  const server = new WseServer({
    port: WS_PORT,
    identify: ({ accept, challenge }) => {
      challenge.response === null ? accept('U1', { ok: true }) : accept(false)
    },
  })

  server.useChallenge((identity, meta, quest) => quest({ q: 'answer with null' }))

  let serverError = null
  let connected = 0
  let joinedMeta

  server.when.error(e => { serverError = serverError || e })
  server.when.connected(() => connected++)
  server.when.joined((client, meta) => { joinedMeta = meta })

  const client = new WseClient({ url: WS_URL })
  client.challenge((quest, solve) => solve(null))

  let connectErr = null
  await client.connect(SECRET, { user_id: 'U1' }).catch(e => { connectErr = e })

  await wait(150)

  if (serverError) return fail(`server threw while accepting: ${ serverError.code }`)
  if (!connected) return fail('connected never fired — accept() blew up mid-way')
  if (connectErr) return fail(`connect rejected: ${ connectErr }`)
  if (joinedMeta?.user_id !== 'U1') return fail(`joined got meta ${ JSON.stringify(joinedMeta) }, expected { user_id: 'U1' }`)

  success('null challenge solution accepted, meta preserved')
})
