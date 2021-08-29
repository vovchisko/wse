export const SIG_CALL = '~call'

export const WSE_REASON = Object.freeze({
  CLIENTS_CONCURRENCY: 'wse.clients-concurrency',
  NOT_AUTHORIZED: 'wse.not-authorized',
  SIGN_OUT: 'wse.sign-out',
  PROTOCOL_ERR: 'wse.protocol-error',
  NO_REASON: 'wse.no-reason',
  BY_CLIENT: 'wse.by-client',
})

export const WSE_CLIENT_ERRORS = Object.freeze({
  CONNECTION_NOT_OPENED: 'wse.not-opened',
  INVALID_CHALLENGE_SOLVER: 'wse.auth.invalid-challenge-solver',
  RP_TIMEOUT: 'wse.rp-timeout',
  RP_NOT_EXISTS: 'wse.rp-not-exists',
  RP_FAILED: 'wse.rp-failed',
  RP_UNKNOWN_ERROR: 'wse.unknown-error',
})

export const WSE_SERVER_ERR = Object.freeze({
  NO_CLIENT_CONNECTION: 'wse-server.client.connection-missing',
  IDENTIFY_HANDLER_MISSING: 'wse-server.auth.identify-handler-missing',
  INVALID_CHALLENGER_FUNCTION: 'wse-server.auth.invalid-challenger-fn',
  FAILED_TO_EXECUTE_RP: 'wse-server.rp.failed',
  RP_NOT_REGISTERED: 'wse-server.rp.not-registered',
  RP_ALREADY_REGISTERED: 'wse-server.rp.already-registered',
  PROTOCOL_VIOLATION: 'wse-server.protocol-violation',
})


export function make_stamp (len = 10) {
  let result = ''
  let i = 0
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  const _l = chars.length
  for (; i < len; i++) {
    result += chars.charAt(Math.floor(Math.random() * _l))
  }
  return result
}

export class WseError extends Error {
  constructor (code, payload = {}) {
    super(code)
    this.type = 'wse-error'
    this.code = code
    this.payload = payload
  }
}