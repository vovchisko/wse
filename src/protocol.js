export class WseJSON {
  constructor () {
    this.name = 'wse-default-json'
    this.internal_types = Object.freeze({
      hi: '~wse:hi',
      challenge: '~wse:challenge',
      welcome: '~wse:welcome',
      call: '~wse:call',
    })
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

