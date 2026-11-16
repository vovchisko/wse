export const WSE_REASON = Object.freeze({
  NO_REASON:           '',
  CLIENTS_CONCURRENCY: 'wse.clients-concurrency',
  NOT_AUTHORIZED:      'wse.not-authorized',
  AUTH_TIMEOUT:        'wse.auth-timeout',
  PROTOCOL_ERR:        'wse.protocol-error',
  BY_CLIENT:           'wse.by-client',
  BY_SERVER:           'wse.by-server',
  SLOW_CLIENT:         'wse.slow-client',
  GATE_CLOSED:         'wse.gate-closed',
})

export const WSE_STATUS = Object.freeze({
  IDLE:          'IDLE',
  OFFLINE:       'OFFLINE',
  READY:         'READY',
  CONNECTING:    'CONNECTING',
  RE_CONNECTING: 'RE_CONNECTING',
})

export const WSE_ERROR = Object.freeze({
  // client
  INVALID_CRA_HANDLER:      'wse.client.invalid-cra-handler',
  RP_TIMEOUT:               'wse.client.rp.timeout',
  RP_DISCONNECT:            'wse.client.rp.disconnect',
  RP_SEND_FAILED:           'wse.client.rp.send-failed',
  CLIENT_ALREADY_CONNECTED: 'wse.client.already-connected',
  WS_CLIENT_ERROR:          'wse.client.ws-error',
  NOT_AUTHORIZED:           'wse.not-authorized',
  CONNECTION_NOT_READY:     'wse.client.not-ready',
  CONNECTION_CLOSED:        'wse.client.connection-closed',

  // both
  MESSAGE_PROCESSING_ERROR: 'wse.msg-processing-error',
  INVALID_TIMEOUT:          'wse.invalid-timeout',

  //server
  NO_CLIENT_CONNECTION:     'wse.server.client.connection-missing',
  IDENTIFY_HANDLER_MISSING: 'wse.server.auth.identify-handler-missing',
  INVALID_CRA_GENERATOR:    'wse.server.auth.invalid-cra-generator',
  RP_EXECUTION_FAILED:      'wse.server.rp.failed',
  RP_NOT_REGISTERED:        'wse.server.rp.not-registered',
  RP_ALREADY_REGISTERED:    'wse.server.rp.already-registered',
  PROTOCOL_VIOLATION:       'wse.server.protocol-violation',
  CONNECTION_ERROR:         'wse.server.connection-error',
  FORWARD_REFUSED:          'wse.server.forward-refused',
  LINK_CLOSED:              'wse.server.link-closed',

  // gate
  NOT_JOINED:               'wse.gate.not-joined',
})

// Wire ops between server.link() and WseGate, flat in one array per postMessage:
// main → gate: JOIN cid seat meta | LEAVE cid seat reason | MSG cid type payload | CALL cid conn_id rp payload stamp | ACK
// gate → main: FRAME cid|null seat off len text | REPLY cid conn_id stamp off len text | JOINED cid seat | LEFT cid seat reason
// off/len point into the transferred ArrayBuffer; seat numbers one forward, so ops of an older forward are dropped.
// ACK: main handled one gate batch; the gate keeps at most two unacknowledged batches in flight.
export const GATE_OP = Object.freeze({ JOIN: 1, LEAVE: 2, MSG: 3, CALL: 4, FRAME: 5, REPLY: 6, JOINED: 7, LEFT: 8, ACK: 9 })

const MAX_TIMEOUT = 2 ** 31 - 1

export function check_tO (tO) {
  if (typeof tO !== 'number' || Number.isNaN(tO) || tO < 0) throw new WseError(WSE_ERROR.INVALID_TIMEOUT, { tO })
  return tO
}

// setTimeout fires at once for anything above MAX_TIMEOUT, Infinity included.
export const tO_armed = tO => tO > 0 && tO <= MAX_TIMEOUT

/**
 * Create low-grade unique ID.
 * @param {number} [len]
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
   * @param {string} code
   * @param {object} details
   */
  constructor (code, details = {}) {
    const rp = typeof details?.rp === 'string' ? `rp:${ details.rp }` : ''
    super([ code, rp, details?.origin?.message ].filter(part => part && typeof part === 'string').join('\n -> '))
    this.name = 'WseError'
    this.type = 'wse-error'
    this.code = code
    this.details = details
  }

  toJSON () {
    return { code: this.code, details: this.details }
  }
}
