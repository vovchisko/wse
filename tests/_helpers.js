let USER_ID_COUNTER = 100

export const SECRET = 'valid-secret'
export const WS_PORT = 64000
export const WS_URL = `ws://localhost:${ WS_PORT }`

/**
 * @param identity
 * @param resolve
 * @param meta
 */
export function identify ({ identity, accept, meta }) {
  if (identity === SECRET) {
    const user_id = meta.user_id || 'USR-' + USER_ID_COUNTER++
    accept(user_id, { hey: 'some additional data for the client' })
  } else {
    accept(false)
  }
}

export function wait (delay) {
  return new Promise(resolve => setTimeout(resolve, delay))
}
