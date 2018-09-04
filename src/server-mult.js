"use strict";

const WebSocket = require('ws');
const EE = require('eventemitter3');
const WseDefaultProtocol = require('./protocol');
const WSE_REASON = require('./reason');

const CLIENT_NOOB = 0;
const CLIENT_VALIDATING = 1;
const CLIENT_VALID = 2;

let WSE_COUNTER = 0;

class WseServerMult extends EE {
    constructor(ws_params = {}, on_auth, wse_protocol = null) {

        super();

        this.clients = {};

        //default properties
        this.name = 'WSE/M-' + ++WSE_COUNTER;
        this.emit_message = true;
        this.emit_message_prefix = 'm:';
        this.cpu = 2;
        this.logging = false;

        this.ws_params = ws_params;

        this.protocol = wse_protocol || new WseDefaultProtocol();
        this.on_auth = on_auth || ((id, data) => {
            throw new Error('params.on_auth function not specified!')
        });

        this.log('configured');
    }

    drop_client(id, reason = WSE_REASON.NO_REASON) {
        if (this.clients[id]) this.clients[id].drop(reason);
    }

    log() {
        if (!this.logging) return;
        console.log(this.name + ':', ...arguments);
    };

    init() {

        this.wss = new WebSocket.Server(this.ws_params);

        let self = this;

        this.wss.on('connection', function (conn, req) {

            if (conn.protocol !== self.protocol.name) {
                return conn.close(1000, WSE_REASON.PROTOCOL_ERR);
            }

            conn.id = null;
            conn.valid_stat = CLIENT_NOOB;

            // RESOLVING IPV4 REMOTE ADDR
            conn.remote_addr = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
            if (conn.remote_addr.substr(0, 7) == "::ffff:") conn.remote_addr = conn.remote_addr.substr(7);


            conn.on('message', function (message) {
                let msg = self.protocol.unpack(message);


                if (!msg) return conn.close(1000, WSE_REASON.PROTOCOL_ERR);

                if (conn.valid_stat === CLIENT_VALIDATING) return;

                if (conn.valid_stat === CLIENT_VALID) {

                    if (self.emit_message)
                        self.emit(self.emit_message_prefix + msg.c, self.clients[conn.id], msg.dat);

                    self.emit('message', self.clients[conn.id], msg.c, msg.dat);

                    return;
                }

                if (conn.valid_stat === CLIENT_NOOB) {
                    conn.valid_stat = CLIENT_VALIDATING;
                    self.on_auth(msg.dat, function (id, data) {
                        if (id) {
                            conn.id = id;
                            conn.valid_stat = CLIENT_VALID;

                            let is_new = false;

                            if (!self.clients[id]) {
                                is_new = true;
                                self.clients[id] = new WseClientConnection(self, id);
                            }

                            let index = self.clients[id].add_conn(conn);

                            self.clients[id].send(self.protocol.hi, data, index);

                            if (is_new) {
                                self.emit('join', self.clients[id]);
                                self.log(id, 'join');
                            }

                            self.emit('connection', self.clients[id], index);

                        } else {
                            conn.close(1000, WSE_REASON.NOT_AUTHORIZED);
                        }
                    });
                }
            });

            conn.on('close', (code, reason) => {
                if (conn.id && conn.valid_stat === CLIENT_VALID && self.clients[conn.id]) {
                    let conn_left = self.clients[conn.id].cleanup();

                    self.emit('close', self.clients[conn.id], code, reason);
                    if (!conn_left) {
                        self.emit('leave', self.clients[conn.id], code, reason);
                        self.log(conn.id, 'leave', code, reason);
                        delete self.clients[conn.id];
                    } else {
                        self.log(conn.id, 'close', code, reason, ' /connections left:', conn_left)
                    }
                }
            });
            conn.onerror = (e) => {
                self.log(e);
                self.emit('error', conn, e.code);
            };

        });

        this.log(`init(); cpu:${this.cpu};`);
        return self;
    }
}

class WseClientConnection {
    /**
     * @param {WseServerMult} parent_wsm - wsm instance
     * @param {id} id - connection
     */
    constructor(parent_wsm, id) {
        this.id = id;
        this.conns = [];
        this.wsm = parent_wsm;
    }

    add_conn(conn) {
        this.conns.push(conn);

        if (this.conns.length > this.wsm.cpu) {
            let rem = this.conns.length - this.wsm.cpu;
            for (let i = 0; i < rem; i++)
                this.conns[i].close(1000, WSE_REASON.OTHER_CLIENT_CONECTED);
        }

        this.wsm.log(this.id, 'connection added. opened:', this.conns.length);

        return this.conns.indexOf(conn);
    }

    send(c, dat, index = null) {
        if (index) return this.conns[index].send(this.wsm.protocol.pack(c, dat));
        for (let i = 0; i < this.conns.length; i++) {
            this.conns[i].send(this.wsm.protocol.pack(c, dat));
        }
    }

    drop(reason = WSE_REASON.NO_REASON) {
        this.wsm.log(this.id, 'drop all connetions. reason:', reason);
        for (let i = 0; i < this.conns.length; i++) {
            this.conns[i].close(1000, reason)
        }
    }

    cleanup() {
        let i = this.conns.length;
        while (i--) {
            if (this.conns[i].readyState === WebSocket.CLOSED) {
                this.conns.splice(i, 1);
            }
        }
        return this.conns.length;
    }

}

module.exports = WseServerMult;
