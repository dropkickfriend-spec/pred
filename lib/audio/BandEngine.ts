import { BandState, MusicStyle } from './types';

const SCALE_INTERVALS: Record<string, number[]> = {
  pentatonic: [0, 2, 4, 7, 9],
  minor:      [0, 2, 3, 5, 7, 8, 10],
  major:      [0, 2, 4, 5, 7, 9, 11],
  blues:      [0, 3, 5, 6, 7, 10],
};

// Chord roots per style (semitone offsets from C), cycling every 4 steps
const PROGRESSIONS: Record<MusicStyle, number[]> = {
  EDM:    [0, 7, 9, 5],   // I - V - vi - IV
  HipHop: [0, 3, 7, 5],   // i - bIII - v - IV
  Jazz:   [2, 7, 0, 0],   // ii - V - I - I
  African:[0, 5, 3, 7],   // I - IV - III - V modal
  Indian: [0, 2, 5, 7],   // Sa Re Pa Ni modal
};

export class BandEngine {
  private ctx: AudioContext;
  private masterGain: GainNode;

  constructor(ctx: AudioContext, masterGain: GainNode) {
    this.ctx = ctx;
    this.masterGain = masterGain;
  }

  private midiToFreq(midi: number): number {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  private chordRoot(style: MusicStyle, step: number): number {
    return PROGRESSIONS[style][Math.floor(step / 4) % 4];
  }

  public playBass(time: number, state: BandState, step: number) {
    // Bass hits on the beat; chaos unlocks off-beat ghost notes
    if (step % 4 !== 0 && Math.random() > state.chaos * 0.3) return;
    const prob = 0.3 + (state.density / 100) * 0.6;
    if (Math.random() > prob) return;

    const freq = this.midiToFreq(36 + this.chordRoot(state.style, step)); // C2 range
    const dur = 0.45;

    // Two detuned sawtooths → LPF for warmth
    for (const detune of [0, 6]) {
      const osc    = this.ctx.createOscillator();
      const filter = this.ctx.createBiquadFilter();
      const gain   = this.ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.value = freq;
      osc.detune.value = detune;

      filter.type = 'lowpass';
      filter.frequency.value = 380 + state.chaos * 900;
      filter.Q.value = 1.6;

      gain.gain.setValueAtTime(0.42, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + dur);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);
      osc.start(time);
      osc.stop(time + dur + 0.01);
    }
  }

  public playLead(time: number, state: BandState, step: number) {
    const prob = (state.density / 100) * 0.55 + state.chaos * 0.25;
    if (Math.random() > prob) return;

    const root   = this.chordRoot(state.style, step);
    // 70% chance chord tone, 30% scale walk
    let semitone: number;
    if (Math.random() < 0.7) {
      const tones = [root, root + 3, root + 7]; // root / minor-3rd / 5th
      semitone = tones[Math.floor(Math.random() * tones.length)];
    } else {
      const scale = SCALE_INTERVALS[state.scale] ?? SCALE_INTERVALS.pentatonic;
      semitone = scale[Math.floor(Math.random() * scale.length)];
    }

    const octaveBase = Math.random() < 0.25 ? 72 : 60; // C5 or C4
    const freq = this.midiToFreq(octaveBase + semitone);
    const dur  = 0.1 + Math.random() * 0.22;

    // Two detuned sawtooths → bandpass for presence
    for (const detune of [-7, 7]) {
      const osc    = this.ctx.createOscillator();
      const filter = this.ctx.createBiquadFilter();
      const gain   = this.ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.value = freq;
      osc.detune.value = detune;

      filter.type = 'bandpass';
      filter.frequency.value = 1100 + state.chaos * 2200;
      filter.Q.value = 2.2;

      if (state.chaos > 0.5) {
        const lfo     = this.ctx.createOscillator();
        const lfoGain = this.ctx.createGain();
        lfo.frequency.value = 5 + state.chaos * 3;
        lfoGain.gain.value  = 9 * state.chaos;
        lfo.connect(lfoGain);
        lfoGain.connect(osc.frequency);
        lfo.start(time);
        lfo.stop(time + dur + 0.01);
      }

      gain.gain.setValueAtTime(0.14, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + dur);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);
      osc.start(time);
      osc.stop(time + dur + 0.01);
    }
  }
}
