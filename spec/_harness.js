import { once as eventOnce } from 'node:events'
import { createServer }      from 'node:http'

import { WebSocket } from 'ws'

import { WseServer } from '../src/server.js'
import { WseClient } from '../src/client.js'

/** The only identity the default identify() accepts. */
export const SECRET = 'valid-secret'

/** Subprotocol of the default JSON protocol - raw probing sockets must request it. */
export const PROTOCOL_NAME = 'wse-default-json'

/** Wire-level message types, for tests that talk to the server without a WseClient. */
export const WSE_TYPES = Object.freeze({
  hi:             '~wse:hi',
  challenge:      '~wse:challenge',
  welcome:        '~wse:welcome',
  response:       '~wse:response',
  response_error: '~wse:response-err',
})

let uid = 0

/**
 * Default auth: SECRET is the only valid identity, meta.user_id becomes the cid.
 * Refuses through accept(false) - the server turns that into a NOT_AUTHORIZED close.
 */
export function identify ({ identity, meta, accept }) {
  if (identity !== SECRET) return accept(false)
  accept(meta.user_id || `user-${ ++uid }`, { hey: 'welcome-payload' })
}

export const wait = ms => new Promise(resolve => setTimeout(resolve, ms))

/**
 * Poll until fn() returns truthy, then return that value.
 * Replaces fixed sleeps: waits exactly as long as needed and names what it waited for.
 */
export async function until (fn, message = 'condition', timeout = 5000, step = 5) {
  const deadline = Date.now() + timeout
  for (;;) {
    const value = await fn()
    if (value) return value
    if (Date.now() >= deadline) throw new Error(`timed out after ${ timeout }ms waiting for: ${ message }`)
    await wait(step)
  }
}

/** First emission of an a-signal, as a promise of its argument tuple. */
export function onceSignal (signal) {
  return new Promise(resolve => signal.once((...args) => resolve(args)))
}

/** Growing array of argument tuples for every emission of an a-signal. */
export function collectSignal (signal) {
  const log = []
  signal.on((...args) => log.push(args))
  return log
}

/** Growing array of payloads for every message of one channel type. */
export function collectChannel (channel, type) {
  const log = []
  channel.on(type, payload => log.push(payload))
  return log
}

/** Awaits a promise and returns the error it rejected with. Throws if it resolves. */
export async function rejection (promise) {
  try {
    await promise
  } catch (err) {
    return err
  }
  throw new Error('expected the promise to reject, but it resolved')
}

/** How a promise ends within `ms`: 'resolved' | 'rejected' | 'hung'. */
export function outcome (promise, ms = 1000) {
  return Promise.race([
    promise.then(() => 'resolved', () => 'rejected'),
    wait(ms).then(() => 'hung'),
  ])
}

/**
 * Per-test sandbox. Everything it hands out is tracked and shut down in t.after(),
 * so no test leaves a listening socket, an open client or a pending server behind.
 *
 * @param {import('node:test').TestContext} t
 */
export function harness (t) {
  const servers = []
  const clients = []
  const sockets = []
  const https = []

  t.after(async () => {
    for (const client of clients) {
      client.re = false
      client.re_on_codes = []
      try { client.close() } catch {}
    }
    for (const socket of sockets) {
      try { socket.terminate() } catch {}
    }
    for (const server of servers) {
      for (const ws_conn of server.ws.clients) {
        try { ws_conn.terminate() } catch {}
      }
      await new Promise(resolve => server.ws.close(resolve))
    }
    for (const http of https) {
      http.closeAllConnections()
      await new Promise(resolve => http.close(resolve))
    }
  })

  const track = (list, item) => (list.push(item), item)

  return {
    /** Tracked WseServer, exactly as constructed. */
    wse (options = {}) {
      return track(servers, new WseServer({ identify, ...options }))
    },

    /** WseServer listening on a free port. Returns the server and the url to reach it. */
    async server (options = {}) {
      const server = this.wse({ port: 0, ...options })
      await eventOnce(server.ws, 'listening')
      return { server, url: `ws://localhost:${ server.ws.address().port }` }
    },

    /** WseServer with no listener of its own, to be fed by an http upgrade. */
    detached (options = {}) {
      return this.wse({ noServer: true, ...options })
    },

    /** Bare node http server listening on a free port. */
    async http () {
      const http = track(https, createServer())
      http.listen(0)
      await eventOnce(http, 'listening')
      return { http, port: http.address().port, url: `ws://localhost:${ http.address().port }` }
    },

    /** Tracked WseClient. */
    client (url, options = {}) {
      return track(clients, new WseClient({ url, ...options }))
    },

    /** Bare ws socket speaking the wse subprotocol - for protocol-level probing. */
    socket (url, protocol = PROTOCOL_NAME) {
      const socket = track(sockets, new WebSocket(url, protocol))
      socket.on('error', () => {})
      return socket
    },
  }
}

/** Close event of a bare ws socket, as [code, reason]. */
export function socketClosed (socket) {
  return new Promise(resolve => socket.on('close', (code, reason) => resolve([ code, String(reason) ])))
}
