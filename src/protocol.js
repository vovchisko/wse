/**
 * Default JSON protocol implementation for WSE.
 */
const decoder = new TextDecoder()

export class WseJSON {
  constructor () {
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
  pack ({ type, payload = undefined, stamp = undefined }) {
    return JSON.stringify([ type, payload, stamp ])
  }

  /**
   * Join packed frames, all text or all binary, into one frame: a JSON array of the tuples.
   * @param {Uint8Array[]} parts - Bytes of frames pack() returned
   * @returns {Uint8Array}
   */
  join (parts) {
    let size = parts.length + 1
    for (const part of parts) size += part.byteLength
    const joined = new Uint8Array(size)
    joined[0] = 0x5b
    let at = 1
    for (let i = 0; i < parts.length; i++) {
      if (i) joined[at++] = 0x2c
      joined.set(parts[i], at)
      at += parts[i].byteLength
    }
    joined[at] = 0x5d
    return joined
  }

  /**
   * Unpack message from JSON, sent as a text or a binary frame.
   * @param {string|ArrayBuffer} encoded - JSON to unpack
   * @returns {[string, *, *]|Array<[string, *, *]>} Tuple of [type, payload, stamp], or a list of them for a joined frame
   */
  unpack (encoded) {
    return JSON.parse(typeof encoded === 'string' ? encoded : decoder.decode(encoded))
  }
}
