"use strict";

const WebSocket = require('ws');
const EventEmitter = require('eventemitter3');
const DefaultProtocol = require('./protocol');
const CLIENT_NOOB = 0;
const CLIENT_VALIDATING = 1;
const CLIENT_VALID = 2;

const MSG_OTHER_CLIENT_CONECTED = 'other-client-connected';
const MSG_UNAUTHORIZED = 'unauthorized';

class WSM extends EventEmitter {
    constructor(port, f_auth, protocol = null) {
        super();
        this.cpu = 2;
        this.port = port;
        this.clients = {};

        this.protocol = protocol || new DefaultProtocol();

        if (!f_auth) throw new Error('Auth function not specified!');
        this.auth = f_auth;
    }

    drop_client(id) {
        if (this.clients[id]) {
            for (let i in this.clients[id]._c) {
                this.clients[id]._c[i].close(1000, 'unauthorized');
            }
        }
    }

    init() {

        let _self = this;

        this.wss = new WebSocket.Server({port: this.port});

        this.wss.on('connection', function (conn) {
            conn.id = null;
            conn.valid_stat = CLIENT_NOOB;

            conn.on('message', function (message) {

                let msg = _self.protocol.unpack(message);
                if (!msg) return conn.close(1000, 'invalid protocol');
                if (conn.valid_stat === CLIENT_VALIDATING) return;
                if (conn.valid_stat === CLIENT_VALID)
                    return _self.emit('message', _self.clients[conn.id], msg.c, msg.dat);

                if (conn.valid_stat === CLIENT_NOOB) {
                    conn.valid_stat = CLIENT_VALIDATING;
                    _self.auth(msg.c, msg.dat, function (id) {
                        if (id) {

                            conn.id = id;
                            conn.valid_stat = CLIENT_VALID;

                            if (_self.clients[id]) {
                                if (_self.clients[id]._c.length >= _self.cpu) {
                                    _self.clients[id]._c[0].close(1000, MSG_OTHER_CLIENT_CONECTED);
                                }
                            } else {
                                _self.clients[id] = {
                                    id: id,
                                    _c: [],
                                    c_send: function (c, dat) {
                                        //native sending data function for each connectin
                                        for (let i = 0; i < this._c.length; i++) {
                                            if (this._c[i].readyState !== WebSocket.OPEN) continue;
                                            this._c[i].send(_self.protocol.pack(c, dat));
                                        }
                                    }
                                };
                            }

                            _self.clients[id]._c.push(conn);
                            _self.clients[id].c_send('welcome', {connections: _self.clients[id]._c.length});
                            _self.emit('connected', _self.clients[id], _self.clients[id]._c.indexOf(conn));
                        } else {
                            conn.close(1000, MSG_UNAUTHORIZED);
                        }
                    });
                }
            });

            conn.on('close', function () {

                if (conn.id !== null && conn.valid_stat === CLIENT_VALID) {
                    let i_disc = _self.clients[conn.id]._c.indexOf(conn);
                    _self.clients[conn.id]._c.splice(i_disc, 1);
                    if (!_self.clients[conn.id]._c.length) {
                        _self.emit('disconnected', conn);
                        delete _self.clients[conn.id];
                    }
                }
            });
            conn.onerror = function (e) {
                _self.emit('error', conn, e.code);
            };

        });


        return this;
    }
}

module.exports = WSM;