import { make_stamp, WSE_ERROR, WseError } from './common.js'

const fail = (code, details, traceStack) => {
  const e = new WseError(code, details)
  if (traceStack) e.stack = `${e.name}: ${e.message}\n${traceStack}`
  return e
}

const withCtx = (details, rp, payload) => {
  if (rp && !details.rp) details.rp = rp
  if (payload !== undefined && !details.payload) details.payload = payload
  return details
}

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
   * @param {string} [rp] - RP name that caused the error
   * @param {*} [payload] - Original RP payload
   * @returns {object} Normalized error object
   */
  static normalizeError (err, rp, payload) {
    if (err && typeof err === 'object' && err.code && err.details) {
      withCtx(err.details, rp, payload)
      return err
    }

    if (err && typeof err === 'object' && !err.message && !err.stack) {
      return {
        code: WSE_ERROR.RP_EXECUTION_FAILED,
        message: 'RPC execution failed',
        details: withCtx({ ...err }, rp, payload),
      }
    }

    const isObj = err && typeof err === 'object'
    return {
      code: WSE_ERROR.RP_EXECUTION_FAILED,
      message: (isObj ? err.message : String(err)) || 'Unexpected error',
      details: withCtx(isObj
          ? { origin: { name: err.name, message: err.message, stack: err.stack } }
          : { origin: { message: String(err) } }, rp, payload),
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

    // Capture user call-site here; async rejection later loses it otherwise.
    const trace = {}
    Error.captureStackTrace?.(trace, RpcManager.prototype.call)

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
        if (isSuccess) return resolve(result)

        // Never trust the peer's error frame. cleanup() already released the
        // timeout and the disconnect guard, so throwing here would strand the
        // caller on a promise nothing can settle anymore.
        reject(fail(result?.code || WSE_ERROR.RP_EXECUTION_FAILED, result?.details, trace.stack))
      }

      this._callbacks.set(stamp, handler)

      // Handle disconnect - necessary for proper error reporting
      disconnectBind = disconnectSignal.once((...args) => {
        cleanup()
        reject(fail(WSE_ERROR.RP_DISCONNECT, { disconnected: args }, trace.stack))
      })

      if (timeout > 0) {
        timeoutHandle = setTimeout(() => {
          cleanup()
          reject(fail(WSE_ERROR.RP_TIMEOUT, undefined, trace.stack))
        }, timeout * 1000)
      }

      // A synchronous failure here rejects the promise on its own, but without
      // cleanup() the stamp, the disconnect bind and the timeout all leak — and
      // with tO: 0 nothing ever sweeps them.
      try {
        sendFn(protocol.pack({ type: rp, payload, stamp }))
      } catch (err) {
        cleanup()
        reject(fail(WSE_ERROR.RP_SEND_FAILED, {
          rp,
          payload,
          origin: { name: err?.name, message: err?.message },
        }, trace.stack))
      }
    })
  }
}
