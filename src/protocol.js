export class WseJSON {
  constructor () {
    this.name = 'wse-default-json'
    this.hi = 'hi'
    this.challenge = 'challenge'
    this.welcome = 'welcome'
  }

  pack ({ type, payload = undefined, stamp = undefined }) {
    return JSON.stringify([
      type,
      payload,
      stamp,
    ])
  }

  unpack (encoded) {
    return JSON.parse(encoded)
  }
}

