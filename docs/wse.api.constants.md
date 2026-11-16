# Constants

## WSE_ERROR

Both sides:

- `MESSAGE_PROCESSING_ERROR` - Incoming frame could not be unpacked
- `INVALID_TIMEOUT` - `tO` is negative, `NaN` or not a number

Client:

- `CLIENT_ALREADY_CONNECTED` - Client is already connected
- `CONNECTION_NOT_READY` - Connection not established
- `CONNECTION_CLOSED` - Connection closed before it became ready
- `WS_CLIENT_ERROR` - WebSocket client error
- `INVALID_CRA_HANDLER` - Invalid challenge-response handler
- `NOT_AUTHORIZED` - Authentication refused by the server
- `RP_TIMEOUT` - RPC call timed out
- `RP_DISCONNECT` - Connection lost during RPC
- `RP_SEND_FAILED` - RPC could not be sent

Server:

- `RP_NOT_REGISTERED` - RPC not found
- `RP_EXECUTION_FAILED` - RPC execution failed
- `RP_ALREADY_REGISTERED` - RPC already registered
- `IDENTIFY_HANDLER_MISSING` - No identify handler provided
- `INVALID_CRA_GENERATOR` - Invalid challenge generator
- `NO_CLIENT_CONNECTION` - Client connection not found
- `PROTOCOL_VIOLATION` - Protocol violation
- `CONNECTION_ERROR` - Connection-level error
- `FORWARD_REFUSED` - A link guard refused to forward a call
- `LINK_CLOSED` - `server.forward()` to a link whose port closed, or a gate call still in flight when it closed

Gate:

- `NOT_JOINED` - A call reached the gate before it admitted the client

## WSE_REASON

- `BY_CLIENT` - Connection closed by client
- `BY_SERVER` - Connection closed by server
- `NOT_AUTHORIZED` - Authentication failed
- `PROTOCOL_ERR` - Protocol error
- `CLIENTS_CONCURRENCY` - Too many connections
- `SLOW_CLIENT` - Socket buffered past the link's `maxBuffered` (off unless set)
- `GATE_CLOSED` - The gate's port closed
- `NO_REASON` - No specific reason

## WSE_STATUS

- `IDLE` - Client is idle
- `CONNECTING` - Connecting to server
- `RE_CONNECTING` - Reconnecting
- `READY` - Connected and authenticated
- `OFFLINE` - Disconnected