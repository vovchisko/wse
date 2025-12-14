import { make_stamp, WSE_ERROR, WseError } from './common.js'

/**
 * Common RPC functionality shared between client and server
 */
export class RpcManager {
  constructor () {
    this._rps = new Map() // rp_name -> handler_function
    this._callbacks = new Map() // stamp -> callback_function
  }

  /**
   * Normalize error for RPC response.
   * @param {*} err - Error to normalize
   * @param {string} [rpcName] - RPC name that caused the error
   * @param {*} [rpcPayload] - Original RPC payload
   * @returns {object} Normalized error object
   */
  static normalizeError (err, rpcName, rpcPayload) {
    // If already a WseError, add RPC context if not present
    if (err.code && err.details) {
      if (rpcName && !err.details.rpc) {
        err.details.rpc = rpcName
      }
      if (rpcPayload !== undefined && !err.details.payload) {
        err.details.payload = rpcPayload
      }
      return err
    }
    
    // If error is a plain object (custom error), preserve it directly
    // while adding RPC context
    if (err && typeof err === 'object' && !err.message && !err.stack) {
      const details = { ...err }
      if (rpcName) details.rpc = rpcName
      if (rpcPayload !== undefined) details.payload = rpcPayload
      
      return { 
        code: WSE_ERROR.RP_EXECUTION_FAILED, 
        message: 'RPC execution failed',
        details 
      }
    }
    
    // For Error objects, serialize them properly for network transport
    const details = { 
      origin: {
        name: err.name,
        message: err.message,
        stack: err.stack
      }
    }
    if (rpcName) details.rpc = rpcName
    if (rpcPayload !== undefined) details.payload = rpcPayload
    
    return { 
      code: WSE_ERROR.RP_EXECUTION_FAILED, 
      message: err.message || 'Unexpected error', 
      details 
    }
  }

  /**
   * Register remote procedure.
   * @param {string} rp - Remote procedure name
   * @param {Function} handler - Function to handle RPC calls
   */
  register (rp, handler) {
    if (this._rps.has(rp)) throw new WseError(WSE_ERROR.RP_ALREADY_REGISTERED, { rp })
    this._rps.set(rp, handler)
  }

  /**
   * Unregister existing RPC.
   * @param {string} rp - RPC name
   */
  unregister (rp) {
    if (!this._rps.has(rp)) throw new WseError(WSE_ERROR.RP_NOT_REGISTERED, { rp })
    this._rps.delete(rp)
  }

  /**
   * Check if RPC is registered.
   * @param {string} rp - RPC name
   * @returns {boolean}
   */
  has (rp) {
    return this._rps.has(rp)
  }

  /**
   * Get RPC handler.
   * @param {string} rp - RPC name
   * @returns {Function}
   */
  get (rp) {
    return this._rps.get(rp)
  }

  /**
   * Handle RPC response - direct callback execution.
   * @param {string} stamp - RPC call stamp
   * @param {*} payload - Response payload
   * @param {boolean} isSuccess - Whether response is success or error
   * @returns {boolean} True if callback was found and executed
   */
  handleResponse (stamp, payload, isSuccess) {
    const callback = this._callbacks.get(stamp)
    if (callback) {
      this._callbacks.delete(stamp)
      callback(payload, isSuccess)
      return true
    }
    return false
  }

  /**
   * Create RPC call promise.
   * @param {object} protocol - Protocol instance
   * @param {string} rp - RPC name
   * @param {*} payload - RPC payload
   * @param {number} timeout - Timeout in seconds
   * @param {Function} sendFn - Function to send message
   * @param {object} disconnectSignal - Signal for disconnect events
   * @returns {Promise<*>} RPC result promise
   */
  call (protocol, rp, payload, timeout, sendFn, disconnectSignal) {
    if (!rp || typeof rp !== 'string') throw new WseError(WSE_ERROR.RP_NOT_REGISTERED, { rp })

    return new Promise((resolve, reject) => {
      const stamp = make_stamp()
      let timeoutHandle
      let disconnectBind

      const cleanup = () => {
        if (timeoutHandle) clearTimeout(timeoutHandle)
        if (disconnectBind) disconnectBind.off()
        this._callbacks.delete(stamp)
      }

      const handler = (result, isSuccess) => {
        cleanup()
        if (isSuccess) {
          resolve(result)
        } else {
          reject(new WseError(result.code, result.details))
        }
      }

      this._callbacks.set(stamp, handler)

      // Handle disconnect - necessary for proper error reporting
      disconnectBind = disconnectSignal.once((...args) => {
        cleanup()
        reject(new WseError(WSE_ERROR.RP_DISCONNECT, { disconnected: args }))
      })

      if (timeout > 0) {
        timeoutHandle = setTimeout(() => {
          cleanup()
          reject(new WseError(WSE_ERROR.RP_TIMEOUT))
        }, timeout * 1000)
      }

      sendFn(protocol.pack({ type: rp, payload, stamp }))
    })
  }
}
