const encoder = new TextEncoder()

const bytes = packed => {
  if (typeof packed === 'string') return encoder.encode(packed)
  if (packed instanceof ArrayBuffer) return new Uint8Array(packed)
  return new Uint8Array(packed.buffer, packed.byteOffset, packed.byteLength)
}

/**
 * Write queued frames in order. A run of text frames, or of binary frames, becomes one frame through
 * protocol.join() when the protocol has it and does not decline the run.
 * @param {Array<[*, boolean]>} frames - [frame, text] pairs: a frame protocol.pack() returned (or its bytes), and whether it is text
 * @param {object} protocol
 * @param {function(*, boolean): void} write - (frame, text)
 */
export function write_frames (frames, protocol, write) {
  const join = typeof protocol.join === 'function' && frames.length > 1
  for (let i = 0; i < frames.length;) {
    const text = frames[i][1]
    let end = i + 1
    if (join) while (end < frames.length && frames[end][1] === text) end++
    const joined = end - i > 1 ? protocol.join(frames.slice(i, end).map(([ frame ]) => bytes(frame)), text) : undefined
    if (joined) write(joined, text)
    else for (let k = i; k < end; k++) write(frames[k][0], text)
    i = end
  }
}

/**
 * Frames of what protocol.unpack() returned: a joined frame unpacks to a list of [type, payload, stamp].
 * @param {Array} unpacked
 * @returns {Array<Array>}
 */
export const frames_of = unpacked => Array.isArray(unpacked[0]) ? unpacked : [ unpacked ]
