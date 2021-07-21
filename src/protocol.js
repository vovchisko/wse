class WseJSON {
  constructor () {
    this.name = 'wse-default-json'
    this.hi = 'hi'
    this.challenge = 'challenge'
    this.welcome = 'welcome'
  }

  pack (c, dat) {
    return JSON.stringify({
      c: c,
      dat: dat,
    })
  }

  unpack (encoded) {
    return JSON.parse(encoded)
  }
}

export default WseJSON
