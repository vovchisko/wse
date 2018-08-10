const DefaultProtocol = require("./protocol");
const EventEmitter = require("eventemitter3");
const WebSocket = require('isomorphic-ws');

class wseServer extends EventEmitter {
    constructor(url, protocol = null) {
        super();

        this.protocol = protocol || new DefaultProtocol();

        this.wsc = new WebSocket(url);

        this.wsc.onopen = () => {
            this.emit('open');
        };

        this.wsc.onmessage = (message) => {
            let m = this.protocol.unpack(message.data);
            this.emit('m:' + m.c, m.dat);
            this.emit('message', m.c, m.dat);
        };

        this.wsc.onerror = (e) => {
            this.emit('error', e);
        };

        this.wsc.onclose = (event) => {
            this.emit('close', event.code, event.reason);
        };
    }

    send(c, dat) {
        if (this.wsc.readyState === WebSocket.OPEN) {
            this.wsc.send(this.protocol.pack(c, dat));
        } else {
            this.emit('error', new Error('socket-not-opened'))
        }
    }

    close(reason = 'by-client') {
        this.wsc.close(1000, reason);
    }
}

module.exports = wseServer;


