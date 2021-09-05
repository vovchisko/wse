export const WSE_REASON = Object.freeze({
  CLIENTS_CONCURRENCY: 'wse.clients-concurrency',
  NOT_AUTHORIZED: 'wse.not-authorized',
  PROTOCOL_ERR: 'wse.protocol-error',
  NO_REASON: 'wse.no-reason',
  BY_CLIENT: 'wse.by-client',
})

export const WSE_CLIENT_ERRORS = Object.freeze({
  CONNECTION_NOT_OPENED: 'wse.client.not-opened',
  INVALID_CRA_HANDLER: 'wse.client.invalid-cra-handler',
  RP_TIMEOUT: 'wse.client.rp-timeout',
  RP_NOT_EXISTS: 'wse.client.rp-not-exists',
  RP_FAILED: 'wse.client.rp-failed',
  RP_RESPONSE_ERR: 'wse.client.rp-response-error',
  WS_ERROR: 'wse.client.ws-error',
})

export const WSE_SERVER_ERR = Object.freeze({
  NO_CLIENT_CONNECTION: 'wse-server.client.connection-missing',
  IDENTIFY_HANDLER_MISSING: 'wse-server.auth.identify-handler-missing',
  INVALID_CRA_GENERATOR: 'wse-server.auth.invalid-cra-generator',
  FAILED_TO_EXECUTE_RP: 'wse-server.rp.failed',
  RP_NOT_REGISTERED: 'wse-server.rp.not-registered',
  RP_ALREADY_REGISTERED: 'wse-server.rp.already-registered',
  PROTOCOL_VIOLATION: 'wse-server.protocol-violation',
  CONNECTION_ERROR: 'wse-server.connection-error',
  MESSAGE_PROCESSING_ERROR: 'wse-server.msg-processing-error',
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
  constructor (code, details = {}) {
    super(code)
    this.type = 'wse-error'
    this.code = code
    this.details = details
  }
}