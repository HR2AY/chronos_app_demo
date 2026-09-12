# Chronos Zen UI sound pack

This folder contains the Zen sound pack from [UI SFX](https://github.com/romainsimon/uisfx).

- One-shot cues: every audio file except `loading`, `processing`, `recording`, `connecting`, `scanning`, and `streaming`.
- Loop cues: those six names. Use `playLoop()` and keep the returned handle until the visible state ends.
- Audio files are CC0 under `LICENSE-AUDIO`.

## Web Audio API helper

`zen-player.js` is a small browser-only player for this folder. It unlocks from a user gesture, prefers Ogg when supported, falls back to MP3, caches decoded buffers, and exposes one-shot and loop playback.

```html
<script type="module">
  import { createZenPlayer } from './zen-player.js'

  const sounds = createZenPlayer()
  document.querySelector('#start').addEventListener('click', async () => {
    await sounds.unlock()
    sounds.play('success')

    const loop = sounds.playLoop('processing')
    // later: loop.stop()
  }, { once: true })
</script>
```

The helper is intended for the web build. For Expo native screens, use the same files with an audio package such as `expo-av` or `expo-audio` and keep the same cue/loop mapping.
