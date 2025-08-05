/**
 * Default JSON protocol implementation for WSE.
 */
export class WseJSON {
  constructor() {
    /**
     * Protocol identifier used in WebSocket handshake.
     * @type {string}
     */
    this.name = 'wse-default-json'

    /**
     * Internal message types used by WSE.
     * @type {object}
     * @property {string} hi - Initial client greeting
     * @property {string} challenge - Challenge-response authentication
     * @property {string} welcome - Server welcome response
     * @property {string} call - Remote procedure call
     * @readonly
     */
    this.internal_types = Object.freeze({
      hi: '~wse:hi',
      challenge: '~wse:challenge',
      welcome: '~wse:welcome',
      call: '~wse:call',
      response: '~wse:response',
      response_error: '~wse:response-err',
    })
  }

  /**
   * Pack message into JSON string.
   * @param {object} message - Message to pack
   * @param {string} message.type - Message type
   * @param {*} [message.payload] - Message payload
   * @param {*} [message.stamp] - Message stamp for RPC
   * @returns {string} JSON string
   */
  pack({ type, payload = undefined, stamp = undefined }) {
    return JSON.stringify([type, payload, stamp])
  }

  /**
   * Unpack message from JSON string.
   * @param {string} encoded - JSON string to unpack
   * @returns {[string, *, *]} Tuple of [type, payload, stamp]
   */
  unpack(encoded) {
    return JSON.parse(encoded)
  }
}
