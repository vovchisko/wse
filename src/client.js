const WseDefaultProtocol = require("./protocol");
const EventEmitter = require("eventemitter3");
const WebSocket = require('isomorphic-ws');

class WseServer extends EventEmitter {
    constructor(url, options, wse_protocol = null) {
        super();

        this.protocol = wse_protocol || new WseDefaultProtocol();
        this.url = url;
        this.options = options;

        this.ws = new WebSocket(url, this.protocol.name, this.options);

        this.ws.onopen = () => {
            this.emit('open');
        };

        this.ws.onmessage = (message) => {
            let m = this.protocol.unpack(message.data);
            this.emit('m:' + m.c, m.dat);
            this.emit('message', m.c, m.dat);
        };

        this.ws.onerror = (e) => {
            this.emit('error', e);
        };

        this.ws.onclose = (event) => {
            this.emit('close', event.code, event.reason);
        };
    }

    send(c, dat) {
        if (this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(this.protocol.pack(c, dat));
        } else {
            this.emit('error', new Error('socket-not-opened'))
        }
    }

    close(code = 1000, reason = 'by-client') {
        this.ws.close(code, reason);
    }
}

module.exports = WseServer;


