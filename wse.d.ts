import { EventEmitter } from 'tseep'
import { WebSocket, WebSocketServer } from 'ws'

// Common types and constants
export declare const WSE_REASON: {
  readonly BY_CLIENT: 'BY_CLIENT'
  readonly BY_SERVER: 'BY_SERVER'
  readonly NOT_AUTHORIZED: 'NOT_AUTHORIZED'
  readonly PROTOCOL_ERR: 'PROTOCOL_ERR'
  readonly CLIENTS_CONCURRENCY: 'CLIENTS_CONCURRENCY'
  readonly NO_REASON: 'NO_REASON'
}

export declare const WSE_STATUS: {
  readonly IDLE: 'IDLE'
  readonly CONNECTING: 'CONNECTING'
  readonly RE_CONNECTING: 'RE_CONNECTING'
  readonly READY: 'READY'
  readonly OFFLINE: 'OFFLINE'
}

export declare const WSE_ERROR: {
  readonly CLIENT_ALREADY_CONNECTED: 'CLIENT_ALREADY_CONNECTED'
  readonly CONNECTION_NOT_READY: 'CONNECTION_NOT_READY'
  readonly WS_CLIENT_ERROR: 'WS_CLIENT_ERROR'
  readonly INVALID_CRA_HANDLER: 'INVALID_CRA_HANDLER'
  readonly RP_TIMEOUT: 'RP_TIMEOUT'
  readonly RP_NOT_REGISTERED: 'RP_NOT_REGISTERED'
  readonly RP_EXECUTION_FAILED: 'RP_EXECUTION_FAILED'
  readonly RP_DISCONNECT: 'RP_DISCONNECT'
  readonly RP_ALREADY_REGISTERED: 'RP_ALREADY_REGISTERED'
  readonly IDENTIFY_HANDLER_MISSING: 'IDENTIFY_HANDLER_MISSING'
  readonly NO_CLIENT_CONNECTION: 'NO_CLIENT_CONNECTION'
  readonly PROTOCOL_VIOLATION: 'PROTOCOL_VIOLATION'
}

export declare class WseError extends Error {
  type: 'wse-error'
  code: string
  details: Record<string, any>
  
  constructor(code: string, details?: Record<string, any>)
}

// Protocol interface
export interface WseProtocol {
  name: string
  internal_types: {
    hi: string
    challenge: string
    welcome: string
    call: string
    response: string
    response_error: string
  }
  pack(message: { type: string; payload?: any; stamp?: any }): string
  unpack(encoded: string): [string, any, any]
}

export declare class WseJSON implements WseProtocol {
  name: string
  internal_types: {
    hi: string
    challenge: string
    welcome: string
    call: string
    response: string
    response_error: string
  }
  pack(message: { type: string; payload?: any; stamp?: any }): string
  unpack(encoded: string): [string, any, any]
}

// Client types
export type ChallengeHandler = (quest: any, solve: (answer: any) => void) => void

export interface WseClientOptions {
  url: string
  tO?: number
  re?: boolean
  protocol?: WseProtocol
  [key: string]: any
}

export declare class WseClient {
  protocol: WseProtocol
  url: string
  ws_options: Record<string, any>
  reused: number
  tO: number
  channel: EventEmitter
  status: string
  challenge_solver: ChallengeHandler | null
  
  // Signal-based events
  when: {
    ignored: (callback: (type: string, payload: any, stamp?: string) => void) => void
    connected: (callback: () => void) => void
    ready: (callback: (payload: any) => void) => void
    error: (callback: (error: WseError) => void) => void
    closed: (callback: (code: number, reason: string) => void) => void
    updated: (callback: (status: string) => void) => void
  }
  
  constructor(options: WseClientOptions)
  
  connect(identity?: any, meta?: Record<string, any>): Promise<any>
  challenge(solver: ChallengeHandler): void
  send(type: string, payload?: any): void
  call(rp: string, payload?: any): Promise<any>
  register(rp: string, handler: (payload: any) => Promise<any> | any): void
  unregister(rp: string): void
  close(reason?: string): void
}

// Server types
export declare class WseConnection {
  /** Original authentication data sent by client (tokens, credentials, etc.) */
  identity: any
  /** Additional metadata provided during connection */
  meta: Record<string, any>
  challenge_quest: any
  challenge_response: any
  valid_stat: string
  conn_id: string
  remote_addr: string
  /** Which user this connection belongs to (null until authenticated) */
  client: WseIdentity | null
  
  readonly readyState: number
  readonly cid: string | null
  
  constructor(ws_conn: WebSocket, server: WseServer)
  
  send(type: string, payload?: any): void
  call(rp: string, payload?: any): Promise<any>
  drop(reason?: string): void
}

export declare class WseIdentity {
  /** Resolved client identifier (e.g., user ID, account ID) */
  cid: string
  /** Active connections for this user (devices) - conn.client points back to this */
  conns: Map<string, WseConnection>
  /** Additional metadata from connection */
  meta: Record<string, any>
  
  constructor(params: { cid: string; meta?: Record<string, any> }, server: WseServer)
  
  send(type: string, payload?: any): void
  drop(reason?: string): void
}

export type RPCHandler = (conn: WseConnection, payload: any) => Promise<any> | any

export type IdentifyCallback = (params: {
  identity: any
  meta: Record<string, any>
  accept: (cid: string | false, welcomePayload?: any) => void
  refuse: () => void
  challenge?: { quest: any; response: any } | null
  id: string
}) => void

export type ChallengeGenerator = (
  identity: any,
  meta: Record<string, any>,
  quest: (challenge: any) => void,
  refuse: () => void
) => void

export interface WseServerOptions {
  identify: IdentifyCallback
  connPerUser?: number
  tO?: number
  protocol?: WseProtocol
  port?: number
  server?: any
  noServer?: boolean
  [key: string]: any
}

export declare class WseServer {
  clients: Map<string, WseIdentity>
  protocol: WseProtocol
  identify: IdentifyCallback
  connPerUser: number
  tO: number
  ws: WebSocketServer
  channel: EventEmitter
  
  // Signal-based events
  // joined/left: User-level events (client = WseIdentity)
  // connected/disconnected: Connection-level events (conn = WseConnection)
  when: {
    joined: (callback: (client: WseIdentity, meta: Record<string, any>) => void) => void
    connected: (callback: (conn: WseConnection) => void) => void
    left: (callback: (client: WseIdentity, code: number, reason: string) => void) => void
    disconnected: (callback: (conn: WseConnection, code: number, reason: string) => void) => void
    ignored: (callback: (conn: WseConnection, type: string, payload: any) => void) => void
    error: (callback: (error: WseError, conn?: WseConnection) => void) => void
  }
  
  constructor(options: WseServerOptions)
  
  useChallenge(generator: ChallengeGenerator): void
  register(rp: string, handler: RPCHandler): void
  unregister(rp: string): void
  broadcast(type: string, payload?: any): void
  send(cid: string, type: string, payload?: any): void
  dropClient(id: string, reason?: string): void
}

export declare function make_stamp(len?: number): string 