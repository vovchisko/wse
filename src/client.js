const WseDefaultProtocol = require("./protocol");
const WSE_REASON = require("./reason");
const EE = require("eventemitter3");
const WebSocket = require('isomorphic-ws');

class WseClient extends EE {
    constructor(url, options, wse_protocol = null) {
        super();
        this.is_online = false;
        this.protocol = wse_protocol || new WseDefaultProtocol();
        this.url = url;
        this.options = options;
        this.emit_message = true;
        this.emit_message_prefix = 'm:';
        this.reused = 0;
    }

    connect(payload) {
        this.reused++;
        this.is_online = null;
        this.ws = new WebSocket(this.url, this.protocol.name, this.options);
        this.ws.onopen = () => this.send(this.protocol.hi, payload);
        this.ws.onmessage = (m) => this._before_welcome(m);
        this.ws.onerror = (e) => this.emit('error', e);
        this.ws.onclose = (event) => {
            this.is_online = false;
            this.emit('close', event.code, event.reason);
        };
        return this;
    }

    _before_welcome(message) {
        let m = this.protocol.unpack(message.data);
        this.is_online = true;
        if (m.c === this.protocol.hi) {
            this.emit('open'); //for capability
            this.emit(this.protocol.hi);
        }
        this.ws.onmessage = (msg) => this._data(msg);
    }

    _data(message) {
        let m = this.protocol.unpack(message.data);
        if (this.emit_message)
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

    close(code = 1000, reason = WSE_REASON.BY_CLIENT) {
        if (this.ws)
            this.ws.close(code, reason);
    }
}

module.exports = WseClient;


