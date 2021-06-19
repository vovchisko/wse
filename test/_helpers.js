import { WseClient, WseServer } from '../node.js'

let USER_ID_COUNTER = 100

export const VALID_SECRET = 'valid-secret'
export const INVALID_SECRET = 'invalid-secret'
export const WS_TEST_PORT = 64000

// auth procedure is all up to you,
// the only required is pass user_id to resolve()
// let's say we expect this ID from user
export function auth_handler (payload, authorize, meta) {
  if (payload === VALID_SECRET) {
    // if client looks valid - assign id to it using resolution function.
    // only after this you'll get message events.
    const user_id = meta.user_id || 'USR-' + USER_ID_COUNTER++
    authorize(user_id, { hey: 'some additional data for the client' })
  } else {
    // user will be disconnected instantly
    // no events fired on the server side
    authorize(false)
  }
}

export function create_server (port = WS_TEST_PORT) {
  const server = new WseServer({ port }, auth_handler)

  if (!process.send) {
    server.logger = (args) => console.log('SERVER::', ...args)
  }

  return server
}

export function create_client (port = WS_TEST_PORT) {
  const client = new WseClient(`ws://localhost:${ port }`, {})

  if (!process.send) {
    client.logger = (args) => console.log('CLIENT::', ...args)
  }

  return client
}

export function create_pair (port = WS_TEST_PORT) {
  return { server: create_server(port), client: create_client(port) }
}

export function create_clients_swarm (count = 2, port = WS_TEST_PORT) {
  let clients = []
  for (let i = 0; i < count; i++) {
    clients.push(create_client(port))
  }
  return clients
}

export function wait (delay) {
  return new Promise(function (resolve) {
    setTimeout(resolve, delay)
  })
}
