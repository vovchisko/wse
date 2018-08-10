class DefaultProtocol {
    constructor() {
        this.type = 'default/json';
    }

    pack(c, dat) {
        console.log('PACK:', c, dat);
        return JSON.stringify({c: c, dat: dat});
    }

    unpack(string) {
        console.log('UN-PACK:', string);
        return JSON.parse(string);
    }
}

module.exports = DefaultProtocol;