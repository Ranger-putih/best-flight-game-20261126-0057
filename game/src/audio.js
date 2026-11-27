// Synthesised sound for Merapi Airlift: no audio files, everything is WebAudio.
// The engine is two detuned oscillators through a low-pass filter, the wind is looped
// noise through a band-pass, and the warnings, delivery chime and crash thud are small
// envelopes on top. Audio starts on the first user gesture and never blocks the game.

export function createAudio() {
  let context = null;
  let master = null;
  let engineOscA = null;
  let engineOscB = null;
  let engineFilter = null;
  let engineGain = null;
  let windSource = null;
  let windFilter = null;
  let windGain = null;
  let muted = false;
  let warningTimer = 0;

  function ensure() {
    if (context) {
      if (context.state === 'suspended') context.resume().catch(() => {});
      return true;
    }
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return false;
      context = new AudioContext();
      master = context.createGain();
      master.gain.value = 0.5;
      master.connect(context.destination);

      // Engine: a low sawtooth plus a sub sine, filtered so it rumbles, not buzzes.
      engineOscA = context.createOscillator();
      engineOscA.type = 'sawtooth';
      engineOscA.frequency.value = 55;
      engineOscB = context.createOscillator();
      engineOscB.type = 'sine';
      engineOscB.frequency.value = 28;
      engineFilter = context.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 420;
      engineGain = context.createGain();
      engineGain.gain.value = 0;
      engineOscA.connect(engineFilter);
      engineOscB.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(master);
      engineOscA.start();
      engineOscB.start();

      // Wind: a 2-second loop of white noise, band-passed, louder with airspeed.
      const length = context.sampleRate * 2;
      const buffer = context.createBuffer(1, length, context.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
      windSource = context.createBufferSource();
      windSource.buffer = buffer;
      windSource.loop = true;
      windFilter = context.createBiquadFilter();
      windFilter.type = 'bandpass';
      windFilter.frequency.value = 700;
      windFilter.Q.value = 0.6;
      windGain = context.createGain();
      windGain.gain.value = 0;
      windSource.connect(windFilter);
      windFilter.connect(windGain);
      windGain.connect(master);
      windSource.start();
      return true;
    } catch {
      context = null;
      return false;
    }
  }

  function beep(frequency, duration, gainValue, type) {
    if (!context || muted) return;
    try {
      const osc = context.createOscillator();
      osc.type = type || 'square';
      osc.frequency.value = frequency;
      const gain = context.createGain();
      gain.gain.setValueAtTime(gainValue, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration);
      osc.connect(gain);
      gain.connect(master);
      osc.start();
      osc.stop(context.currentTime + duration);
    } catch {
      // A failed beep never stops the game.
    }
  }

  return {
    /** Call from any user gesture; safe to call repeatedly. */
    unlock() {
      ensure();
    },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    isMuted() {
      return muted;
    },
    /** Continuous engine + wind, driven every frame from the plane's state. */
    update(plane, flying) {
      if (!context || muted) return;
      const rpm = plane.rpm;
      const speed = plane.speed;
      engineOscA.frequency.value = 48 + rpm * 95;
      engineOscB.frequency.value = 24 + rpm * 48;
      engineFilter.frequency.value = 320 + rpm * 700;
      engineGain.gain.value = flying || plane.throttle > 0.05 ? 0.05 + rpm * 0.11 : 0.02;
      windFilter.frequency.value = 500 + speed * 22;
      windGain.gain.value = flying ? Math.min(0.16, speed * 0.0032) : 0;
    },
    /** A short double-beep while a warning is active, at most twice a second. */
    warn(dt) {
      if (!context || muted) return;
      warningTimer -= dt;
      if (warningTimer <= 0) {
        warningTimer = 0.5;
        beep(880, 0.12, 0.12);
        setTimeout(() => beep(880, 0.12, 0.12), 140);
      }
    },
    delivered() {
      beep(523, 0.16, 0.16, 'sine');
      setTimeout(() => beep(784, 0.28, 0.16, 'sine'), 150);
    },
    ring() {
      beep(1046, 0.14, 0.14, 'sine');
      setTimeout(() => beep(1318, 0.2, 0.12, 'sine'), 110);
    },
    crash() {
      if (!context || muted) return;
      try {
        const length = context.sampleRate * 0.4;
        const buffer = context.createBuffer(1, length, context.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
        const source = context.createBufferSource();
        source.buffer = buffer;
        const filter = context.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 300;
        const gain = context.createGain();
        gain.gain.value = 0.5;
        source.connect(filter);
        filter.connect(gain);
        gain.connect(master);
        source.start();
      } catch {
        // Silence is fine; the crash is visible either way.
      }
    },
  };
}
