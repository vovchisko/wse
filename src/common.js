/**
 * @enum {WSE_REASON}
 */
export const WSE_REASON = Object.freeze({
  CLIENTS_CONCURRENCY: 'wse.clients-concurrency',
  NOT_AUTHORIZED: 'wse.not-authorized',
  PROTOCOL_ERR: 'wse.protocol-error',
  NO_REASON: 'wse.no-reason',
  BY_CLIENT: 'wse.by-client',
})

/**
 * @enum {WSE_CLIENT_ERR}
 */
export const WSE_CLIENT_ERR = Object.freeze({
  CONNECTION_NOT_OPENED: 'wse.client.not-opened',
  INVALID_CRA_HANDLER: 'wse.client.invalid-cra-handler',
  RP_TIMEOUT: 'wse.client.rp.timeout',
  RP_NOT_EXISTS: 'wse.client.rp.not-exists',
  RP_FAILED: 'wse.client.rp.failed',
  RP_RESPONSE_ERR: 'wse.client.rp.response-error',
  RP_DISCONNECT: 'wse.client.rp.disconnect',
  WS_ERROR: 'wse.client.ws-error',
})

/**
 * @enum {WSE_SERVER_ERR}
 */
export const WSE_SERVER_ERR = Object.freeze({
  NO_CLIENT_CONNECTION: 'wse.server.client.connection-missing',
  IDENTIFY_HANDLER_MISSING: 'wse.server.auth.identify-handler-missing',
  INVALID_CRA_GENERATOR: 'wse.server.auth.invalid-cra-generator',
  RP_EXECUTION_FAILED: 'wse.server.rp.failed',
  RP_NOT_REGISTERED: 'wse.server.rp.not-registered',
  RP_ALREADY_REGISTERED: 'wse.server.rp.already-registered',
  PROTOCOL_VIOLATION: 'wse.server.protocol-violation',
  CONNECTION_ERROR: 'wse.server.connection-error',
  MESSAGE_PROCESSING_ERROR: 'wse.server.msg-processing-error',
})

/**
 * Create low-grade unique ID.
 * @param {Number} [len]
 * @returns {string}
 */
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
  /**
   * WseError wrapper
   * @param {String} code
   * @param {Object} details
   */
  constructor (code, details = {}) {
    super(code)
    this.type = 'wse-error'
    this.code = code
    this.details = details
  }
}