let USER_ID_COUNTER = 100

export const VALID_SECRET = 'valid-secret'
export const INVALID_SECRET = 'invalid-secret'
export const WS_TEST_PORT = 64000

// auth procedure is all up to you,
// the only required is pass user_id to resolve()
// let's say we expect this ID from user
export function on_auth (payload, authorize) {
  if (payload === VALID_SECRET) {
    // if client looks valid - assign id to it using resolution function.
    // only after this you'll get message events.
    authorize('USR-' + (USER_ID_COUNTER++), { hey: 'some additional data for the client' })
  } else {
    // user will be disconnected instantly
    // no events fired on the server side
    authorize(false)
  }
}


export function wait (delay) {
  return new Promise(function (resolve) {
    setTimeout(resolve, delay)
  })
}
