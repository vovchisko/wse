import { WseServer } from '../src/server.js'
import { WseClient } from '../src/client.js'

let USER_ID_COUNTER = 100

export const SECRET = 'valid-secret'
export const WS_PORT = 64000
export const WS_URL = `ws://localhost:${ WS_PORT }`

/**
 * @param payload
 * @param resolve
 * @param meta
 */
export function identify ({ payload, resolve, meta }) {
  if (payload === SECRET) {
    const user_id = meta.user_id || 'USR-' + USER_ID_COUNTER++
    resolve(user_id, { hey: 'some additional data for the client' })
  } else {
    resolve(false)
  }
}

export function wait (delay) {
  return new Promise(resolve => setTimeout(resolve, delay))
}
