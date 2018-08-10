const DefaultProtocol = require("./protocol");
const EventEmitter = require("eventemitter3");
const WebSocket = require('ws');

class WSEClient extends EventEmitter {
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

        this.wsc.onclose = (code, reason) => {
            this.emit('close', code, reason);
        };
    }

    send(c, dat) {
        this.wsc.send(this.protocol.pack(c, dat));
    }
}

module.exports = WSEClient;