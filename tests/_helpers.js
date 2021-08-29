import { WseClient, WseServer } from '../node.js'

let USER_ID_COUNTER = 100

export const VALID_SECRET = 'valid-secret'
export const INVALID_SECRET = 'invalid-secret'
export const WS_TEST_PORT = 64000

/**
 * @param payload
 * @param resolve
 * @param meta
 */
export function identify ({ payload, resolve, meta }) {
  if (payload === VALID_SECRET) {
    const user_id = meta.user_id || 'USR-' + USER_ID_COUNTER++
    resolve(user_id, { hey: 'some additional data for the client' })
  } else {
    resolve(false)
  }
}

/**
 * @param options
 * @returns {WseServer}
 */
export function create_server (options = {}) {
  const server = new WseServer({ port: WS_TEST_PORT, identify, ...options })

  if (!process.send) {
    server.logger = (args) => console.log('SERVER::', ...args)
  }

  return server
}

/**
 * @param options
 * @returns {WseClient}
 */
export function create_client (options = {}) {
  const client = new WseClient({ url: `ws://localhost:${ WS_TEST_PORT }`, ...options })

  if (!process.send) {
    client.logger = (args) => console.log('CLIENT::', ...args)
  }

  return client
}

/**
 * @param options
 * @returns {{server: WseServer, client: WseClient}}
 */
export function create_pair (options = {}) {
  return {
    server: create_server(options),
    client: create_client(options),
  }
}

/**
 * @param count
 * @param options
 * @returns {WseClient[]}
 */
export function create_clients_swarm (count = 2, options = {}) {
  let clients = []
  for (let i = 0; i < count; i++) {
    clients.push(create_client(options))
  }
  return clients
}

export function wait (delay) {
  return new Promise(resolve => setTimeout(resolve, delay))
}
