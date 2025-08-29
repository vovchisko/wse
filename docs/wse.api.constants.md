# Constants

## WSE_ERROR

- `CLIENT_ALREADY_CONNECTED` - Client is already connected
- `CONNECTION_NOT_READY` - Connection not established
- `WS_CLIENT_ERROR` - WebSocket client error
- `INVALID_CRA_HANDLER` - Invalid challenge-response handler
- `RP_TIMEOUT` - RPC call timed out
- `RP_NOT_REGISTERED` - RPC not found
- `RP_EXECUTION_FAILED` - RPC execution failed
- `RP_DISCONNECT` - Connection lost during RPC
- `RP_ALREADY_REGISTERED` - RPC already registered
- `IDENTIFY_HANDLER_MISSING` - No identify handler provided
- `NO_CLIENT_CONNECTION` - Client connection not found
- `PROTOCOL_VIOLATION` - Protocol violation

## WSE_REASON

- `BY_CLIENT` - Connection closed by client
- `BY_SERVER` - Connection closed by server
- `NOT_AUTHORIZED` - Authentication failed
- `PROTOCOL_ERR` - Protocol error
- `CLIENTS_CONCURRENCY` - Too many connections
- `NO_REASON` - No specific reason

## WSE_STATUS

- `IDLE` - Client is idle
- `CONNECTING` - Connecting to server
- `RE_CONNECTING` - Reconnecting
- `READY` - Connected and authenticated
- `OFFLINE` - Disconnected