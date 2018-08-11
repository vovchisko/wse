class DefaultProtocol {
    constructor() {
        this.type = 'default/json';
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

module.exports = DefaultProtocol;
