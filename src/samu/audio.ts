// Web Audio API Sound Synthesizer for SAMU 190
// Zero external assets required, 100% reliable across browsers and mobile

let audioCtx: AudioContext | null = null;
let sirenOscillator: OscillatorNode | null = null;
let sirenGain: GainNode | null = null;
let sirenInterval: any = null;
let cprInterval: any = null;

function getAudioContext(): AudioContext {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    audioCtx = new AudioContextClass();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

// Emergency Ambulance Siren for High Priority Driver Dispatch
export function playEmergencySiren(): void {
  try {
    stopEmergencySiren();
    const ctx = getAudioContext();

    sirenGain = ctx.createGain();
    sirenGain.gain.setValueAtTime(0.2, ctx.currentTime);
    sirenGain.connect(ctx.destination);

    sirenOscillator = ctx.createOscillator();
    sirenOscillator.type = 'sawtooth';
    sirenOscillator.frequency.setValueAtTime(650, ctx.currentTime);
    sirenOscillator.connect(sirenGain);
    sirenOscillator.start();

    let high = false;
    sirenInterval = setInterval(() => {
      if (!sirenOscillator || !audioCtx) return;
      const targetFreq = high ? 650 : 980;
      sirenOscillator.frequency.linearRampToValueAtTime(targetFreq, audioCtx.currentTime + 0.25);
      high = !high;
    }, 450);
  } catch (err) {
    console.warn('[Audio] Não foi possível iniciar a sirene:', err);
  }
}

export function stopEmergencySiren(): void {
  if (sirenInterval) {
    clearInterval(sirenInterval);
    sirenInterval = null;
  }
  if (sirenOscillator) {
    try {
      sirenOscillator.stop();
      sirenOscillator.disconnect();
    } catch (_) {}
    sirenOscillator = null;
  }
  if (sirenGain) {
    try {
      sirenGain.disconnect();
    } catch (_) {}
    sirenGain = null;
  }
}

// Quick Notification Beep
export function playBeep(freq = 880, durationMs = 150): void {
  try {
    const ctx = getAudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, ctx.currentTime);

    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + durationMs / 1000);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + durationMs / 1000);
  } catch (_) {}
}

// Confirmation Chime
export function playAcceptSound(): void {
  try {
    playBeep(523.25, 120); // C5
    setTimeout(() => playBeep(659.25, 120), 120); // E5
    setTimeout(() => playBeep(783.99, 200), 240); // G5
  } catch (_) {}
}

// CPR Metronome at 110 BPM (AHA/ERC standard: 100-120 compressions per minute)
export function startCPRMetronome(onBeat?: (count: number) => void): void {
  stopCPRMetronome();
  let count = 0;
  const intervalMs = Math.round(60000 / 110); // ~545ms per compression

  // First beat immediate
  count++;
  playBeep(1000, 70);
  if (onBeat) onBeat(count);

  cprInterval = setInterval(() => {
    count++;
    // Accentuate count every 30 compressions (standard 30:2 cycle)
    const isCycleEnd = count % 30 === 0;
    playBeep(isCycleEnd ? 1200 : 1000, 70);
    if (onBeat) onBeat(count);
  }, intervalMs);
}

export function stopCPRMetronome(): void {
  if (cprInterval) {
    clearInterval(cprInterval);
    cprInterval = null;
  }
}
