const LOOP_CUES = new Set(['loading', 'processing', 'recording', 'connecting', 'scanning', 'streaming'])

export function createZenPlayer(options = {}) {
  const baseUrl = options.baseUrl ?? new URL('./', import.meta.url).href
  const prefer = options.prefer ?? 'ogg'
  let context
  let master
  let volume = clamp(options.volume ?? 0.7)
  let enabled = options.enabled ?? true
  const buffers = new Map()
  const activeLoops = new Map()

  function ensureContext() {
    if (!context) {
      context = new AudioContext()
      master = context.createGain()
      master.gain.value = volume
      master.connect(context.destination)
    }
    return context
  }

  async function unlock() {
    const ctx = ensureContext()
    if (ctx.state !== 'running') await ctx.resume()
  }

  async function load(cue) {
    if (buffers.has(cue)) return buffers.get(cue)
    const ctx = ensureContext()
    const extensions = prefer === 'mp3' ? ['mp3', 'ogg'] : ['ogg', 'mp3']
    let response
    for (const ext of extensions) {
      try {
        response = await fetch(`${baseUrl}${cue}.${ext}`)
        if (response.ok) break
      } catch {}
    }
    if (!response?.ok) throw new Error(`Zen sound not found: ${cue}`)
    const buffer = await ctx.decodeAudioData(await response.arrayBuffer())
    buffers.set(cue, buffer)
    return buffer
  }

  function play(cue, playOptions = {}) {
    if (!enabled || LOOP_CUES.has(cue)) return null
    const ctx = ensureContext()
    const source = ctx.createBufferSource()
    const gain = ctx.createGain()
    source.buffer = buffers.get(cue) ?? null
    gain.gain.value = clamp(playOptions.volume ?? 1)
    source.connect(gain).connect(master)
    const ready = source.buffer ? Promise.resolve() : load(cue).then((buffer) => { source.buffer = buffer })
    ready.then(() => { if (ctx.state === 'running') source.start() }).catch(() => {})
    return { stop: () => { try { source.stop() } catch {} } }
  }

  function playLoop(cue, playOptions = {}) {
    if (!enabled || !LOOP_CUES.has(cue)) return null
    activeLoops.get(cue)?.stop()
    const ctx = ensureContext()
    const source = ctx.createBufferSource()
    const gain = ctx.createGain()
    const handle = { stop: () => { try { source.stop() } catch {}; activeLoops.delete(cue) } }
    source.loop = true
    gain.gain.value = clamp(playOptions.volume ?? 1)
    source.connect(gain).connect(master)
    const ready = load(cue).then((buffer) => { source.buffer = buffer; if (ctx.state === 'running') source.start() }).catch(() => {})
    void ready
    activeLoops.set(cue, handle)
    return handle
  }

  return {
    unlock,
    play,
    playLoop,
    stopLoop: (cue) => activeLoops.get(cue)?.stop(),
    stopAll: () => [...activeLoops.values()].forEach((loop) => loop.stop()),
    setVolume: (value) => { volume = clamp(value); if (master) master.gain.value = volume },
    setEnabled: (value) => { enabled = Boolean(value); if (!enabled) [...activeLoops.values()].forEach((loop) => loop.stop()) },
    isEnabled: () => enabled,
  }
}

function clamp(value) {
  return Math.min(1, Math.max(0, Number(value) || 0))
}
