# wse

Suspicious wrapper for ``ws`` with authorization and customizable protocol. Useful when you talking WS a lot. It looks like original WS, and even smells the same. But a little bit cooler. About 25% cooler.

### Inside:

``WseClient`` - node / Browser client class.
``WseServer`` - node server class.
``WseServerMulti`` - same as WseServer, but support multiple connections with the same user ID.
``WSE_REASON`` - list of constants with reasons for closing connections.
