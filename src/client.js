const WseDefaultProtocol = require("./protocol");
const REASON = require("./reason");
const EE = require("eventemitter3");
const WebSocket = require('isomorphic-ws');

class WseServer extends EE {
    constructor(url, options, wse_protocol = null) {
        super();

        this.protocol = wse_protocol || new WseDefaultProtocol();
        this.url = url;
        this.options = options;
        this.emit_message_enable = false;
        this.emit_message_prefix = '';

        this.reused = 0;
    }

    connect(payload) {
        this.reused++;

        this.ws = new WebSocket(this.url, this.protocol.name, this.options);
        this.ws.onopen = () => this.send(this.protocol.hi, payload);
        this.ws.onmessage = (m) => this._before_welcome(m);
        this.ws.onerror = (e) => this.emit('error', e);
        this.ws.onclose = (event) => this.emit('close', event.code, event.reason);

        return this;
    }

    _before_welcome(message) {
        let m = this.protocol.unpack(message.data);

        if (m.c === this.protocol.hi) {
            this.emit('open', m.dat); //for capability
            this.emit(this.protocol.hi, m.dat);
        }

        this.ws.onmessage = (msg) => this._data(msg);
    }

    _data(message) {
        let m = this.protocol.unpack(message.data);

        if (this.emit_message_enable)
            this.emit(this.emit_message_prefix + m.c, m.dat);

        this.emit('message', m.c, m.dat);
    };

    send(c, dat) {
        if (this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(this.protocol.pack(c, dat));
        } else {
            this.emit('error', new Error('socket-not-opened'))
        }
    }

    close(code = 1000, reason = REASON.BY_CLIENT) {
        this.ws.close(code, reason);
    }
}

module.exports = WseServer;


