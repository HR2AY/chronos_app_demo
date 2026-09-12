type UiSound = "expand" | "collapse" | "success" | "progress-step" | "queued" | "warning" | "loading" | "streaming" | "retry" | "receive" | "skip-previous" | "incoming-call";

let audioContext: AudioContext | null = null;
let audioUnlocked = false;
const buffers = new Map<UiSound, AudioBuffer>();
const activeLoops = new Map<"loading" | "streaming" | "incoming-call", AudioBufferSourceNode>();

function getContext() {
  if (typeof window === "undefined" || !(window.AudioContext || (window as any).webkitAudioContext)) return null;
  const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
  audioContext ??= new AudioContextCtor();
  return audioContext;
}

export async function unlockUiSounds() {
  const context = getContext();
  if (!context) return;
  audioUnlocked = true;
  if (context.state !== "running") await context.resume();
}

export function playUiSound(sound: UiSound) {
  const context = getContext();
  if (!context || !audioUnlocked) return;
  if (context.state !== "running") {
    void context.resume().then(() => playUiSound(sound));
    return;
  }
  const cached = buffers.get(sound);
  if (cached) {
    playBuffer(context, cached);
    return;
  }
  void fetch(soundUrl(sound))
    .then((response) => response.ok ? response.arrayBuffer() : Promise.reject(new Error("sound unavailable")))
    .then((data) => context.decodeAudioData(data))
    .then((buffer) => {
      buffers.set(sound, buffer);
      playBuffer(context, buffer);
    })
    .catch(() => undefined);
}

export function playUiSoundLoop(sound: "loading" | "streaming" | "incoming-call") {
  const context = getContext();
  if (!context || !audioUnlocked) return;
  const previous = activeLoops.get(sound);
  if (previous) {
    activeLoops.delete(sound);
    try { previous.stop(); } catch { /* source may not have started yet */ }
  }
  const source = context.createBufferSource();
  source.loop = true;
  source.connect(context.destination);
  activeLoops.set(sound, source);
  const cached = buffers.get(sound);
  const ready = cached
    ? Promise.resolve(cached)
    : fetch(soundUrl(sound))
      .then((response) => response.ok ? response.arrayBuffer() : Promise.reject(new Error("sound unavailable")))
      .then((data) => context.decodeAudioData(data))
      .then((buffer) => { buffers.set(sound, buffer); return buffer; });
  void ready.then((buffer) => {
    if (activeLoops.get(sound) !== source || context.state !== "running") return;
    source.buffer = buffer;
    source.start(0);
  }).catch(() => {
    if (activeLoops.get(sound) === source) activeLoops.delete(sound);
  });
}

export function stopUiSoundLoop(sound: "loading" | "streaming" | "incoming-call") {
  const source = activeLoops.get(sound);
  if (!source) return;
  activeLoops.delete(sound);
  try { source.stop(); } catch { /* source may not have started yet */ }
}

export function stopAllUiSoundLoops() {
  for (const sound of activeLoops.keys()) stopUiSoundLoop(sound);
}

function playBuffer(context: AudioContext, buffer: AudioBuffer) {
  if (context.state !== "running") return;
  const source = context.createBufferSource();
  const gain = context.createGain();
  source.buffer = buffer;
  gain.gain.value = 0.65;
  source.connect(gain).connect(context.destination);
  source.start(0);
}

function soundUrl(sound: UiSound) {
  return sound === "incoming-call" ? "/sounds/Blank%20Banshee%20-%20Home.mp3" : `/sounds/zen/${sound}.mp3`;
}
