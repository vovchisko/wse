/**
 * @enum {string}
 */
export const WSE_REASON = Object.freeze({
  NO_REASON: '',
  CLIENTS_CONCURRENCY: 'wse.clients-concurrency',
  NOT_AUTHORIZED: 'wse.not-authorized',
  PROTOCOL_ERR: 'wse.protocol-error',
  BY_CLIENT: 'wse.by-client',
})

/**
 * @enum {string}
 */
export const WSE_STATUS = {
  IDLE: 'IDLE',
  OFFLINE: 'OFFLINE',
  READY: 'READY',
  CONNECTING: 'CONNECTING',
  RE_CONNECTING: 'RE_CONNECTING',
}

/**
 * @enum {string}
 */
export const WSE_ERROR = Object.freeze({
  // client
  INVALID_CRA_HANDLER: 'wse.client.invalid-cra-handler',
  RP_TIMEOUT: 'wse.client.rp.timeout',
  RP_DISCONNECT: 'wse.client.rp.disconnect',
  CLIENT_ALREADY_CONNECTED: 'wse.client.already-connected',
  WS_CLIENT_ERROR: 'wse.client.ws-error',
  NOT_AUTHORIZED: 'wse.not-authorized',
  CONNECTION_NOT_READY: 'wse.client.not-ready',

  //server
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
 * @param {number} [len]
 * @returns {string}
 */
export function make_stamp(len = 10) {
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
   * @param {string} code
   * @param {object} details
   */
  constructor(code, details = {}) {
    super(code)
    this.type = 'wse-error'
    this.code = code
    this.details = details
  }
}
