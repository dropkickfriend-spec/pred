import { BandState, MusicStyle } from './types';

// Euclidean rhythm: distributes `beats` pulses across `steps` as evenly as possible
function euclidean(steps: number, beats: number, offset = 0): number[] {
  const pattern = new Array(steps).fill(0);
  for (let k = 0; k < beats; k++) {
    pattern[Math.floor(k * steps / beats)] = 1;
  }
  const off = ((offset % steps) + steps) % steps;
  return [...pattern.slice(steps - off), ...pattern.slice(0, steps - off)];
}

const RHYTHMS: Record<MusicStyle, { kick: number[]; snare: number[]; hihat: number[] }> = {
  EDM:    { kick: euclidean(16, 4),     snare: euclidean(16, 2, 4),  hihat: euclidean(16, 8) },
  HipHop: { kick: euclidean(16, 5),     snare: euclidean(16, 2, 4),  hihat: euclidean(16, 13) },
  Jazz:   { kick: euclidean(16, 3),     snare: euclidean(16, 3, 5),  hihat: euclidean(16, 11) },
  African:{ kick: euclidean(16, 5),     snare: euclidean(16, 3, 2),  hihat: euclidean(16, 11, 1) },
  Indian: { kick: euclidean(16, 7),     snare: euclidean(16, 5, 3),  hihat: euclidean(16, 9,  1) },
};

export class DrumEngine {
  private ctx: AudioContext;
  private masterGain: GainNode;

  constructor(ctx: AudioContext, masterGain: GainNode) {
    this.ctx = ctx;
    this.masterGain = masterGain;
  }

  public playKick(time: number, velocity: number) {
    // Body: sine sweep with sub weight
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(160, time);
    osc.frequency.exponentialRampToValueAtTime(38, time + 0.07);
    gain.gain.setValueAtTime(velocity * 2.8, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.55);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(time);
    osc.stop(time + 0.55);

    // Click transient for punch
    const click = this.ctx.createOscillator();
    const clickGain = this.ctx.createGain();
    click.type = 'square';
    click.frequency.setValueAtTime(1400, time);
    click.frequency.exponentialRampToValueAtTime(60, time + 0.009);
    clickGain.gain.setValueAtTime(velocity * 0.6, time);
    clickGain.gain.exponentialRampToValueAtTime(0.001, time + 0.013);
    click.connect(clickGain);
    clickGain.connect(this.masterGain);
    click.start(time);
    click.stop(time + 0.015);
  }

  public playSnare(time: number, velocity: number) {
    // Noise: bandpass-filtered for body
    const bufSize = Math.floor(this.ctx.sampleRate * 0.22);
    const buffer = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2200;
    bp.Q.value = 0.7;
    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(velocity * 1.6, time);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, time + 0.2);
    noise.connect(bp);
    bp.connect(noiseGain);
    noiseGain.connect(this.masterGain);
    noise.start(time);
    noise.stop(time + 0.22);

    // Snap tone
    const snap = this.ctx.createOscillator();
    const snapGain = this.ctx.createGain();
    snap.type = 'triangle';
    snap.frequency.setValueAtTime(240, time);
    snap.frequency.exponentialRampToValueAtTime(90, time + 0.05);
    snapGain.gain.setValueAtTime(velocity * 0.9, time);
    snapGain.gain.exponentialRampToValueAtTime(0.001, time + 0.07);
    snap.connect(snapGain);
    snapGain.connect(this.masterGain);
    snap.start(time);
    snap.stop(time + 0.08);
  }

  public playHiHat(time: number, velocity: number, open = false) {
    // Metallic: sum of square waves at inharmonic ratios (cymbal recipe)
    const decay = open ? 0.38 : 0.055;
    const baseFreq = 800;
    const ratios = [1.0, 1.275, 1.663, 2.218, 2.645, 3.172];

    const merger = this.ctx.createGain();
    merger.gain.value = 0.1 / ratios.length;

    ratios.forEach(r => {
      const osc = this.ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.value = baseFreq * r;
      osc.connect(merger);
      osc.start(time);
      osc.stop(time + decay + 0.01);
    });

    const hpf = this.ctx.createBiquadFilter();
    hpf.type = 'highpass';
    hpf.frequency.value = 6800;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(velocity * 0.7, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + decay);

    merger.connect(hpf);
    hpf.connect(gain);
    gain.connect(this.masterGain);
  }

  // Returns velocity for each drum voice; 0 = silent.
  // Entropy: Euclidean pattern sets probability; chaos adds ghost notes and drops.
  public getPattern(
    style: MusicStyle,
    step: number,
    chaos: number,
  ): { kick: number; snare: number; hihat: number } {
    const base = RHYTHMS[style];
    const s = step % 16;

    const kickProb  = base.kick[s]  ? 1 - chaos * 0.22 : chaos * 0.07;
    const snareProb = base.snare[s] ? 1 - chaos * 0.18 : chaos * 0.04;
    const hihatProb = base.hihat[s] ? 1 - chaos * 0.28 : chaos * 0.12;

    return {
      kick:  Math.random() < kickProb  ? 0.75 + Math.random() * 0.25 : 0,
      snare: Math.random() < snareProb ? 0.75 + Math.random() * 0.25 : 0,
      hihat: Math.random() < hihatProb ? 0.40 + Math.random() * 0.30 : 0,
    };
  }
}
