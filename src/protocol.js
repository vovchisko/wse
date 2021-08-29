export class WseJSON {
  constructor () {
    this.name = 'wse-default-json'
    this.hi = 'hi'
    this.challenge = 'challenge'
    this.welcome = 'welcome'
  }

  pack ({ c, dat = undefined, stamp = undefined }) {
    return JSON.stringify({
      c,
      dat,
      stamp,
    })
  }

  unpack (encoded) {
    return JSON.parse(encoded)
  }
}

