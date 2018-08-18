class WseDefaultProtocol {
    constructor() {
        this.name = 'wse-default-json';
        this.hi = 'hi';
    }

    pack(c, dat) {
        return JSON.stringify({
            c: c,
            dat: dat
        });
    }

    unpack(string) {
        return JSON.parse(string);
    }
}

module.exports = WseDefaultProtocol;
