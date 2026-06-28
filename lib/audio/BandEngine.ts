import { BandState, MusicStyle } from './types';

const SCALE_INTERVALS: Record<string, number[]> = {
  pentatonic: [0, 2, 4, 7, 9],
  minor:      [0, 2, 3, 5, 7, 8, 10],
  major:      [0, 2, 4, 5, 7, 9, 11],
  blues:      [0, 3, 5, 6, 7, 10],
};

// Chord roots per style (semitone offsets from C), cycling every 4 steps
const PROGRESSIONS: Record<MusicStyle, number[]> = {
  EDM:    [0, 7, 9, 5],
  HipHop: [0, 3, 7, 5],
  Jazz:   [2, 7, 0, 0],
  African:[0, 5, 3, 7],
  Indian: [0, 2, 5, 7],
};

export class BandEngine {
  private ctx:        AudioContext;
  private masterGain: GainNode;
  private lastBassMidi = 36; // voice-lead from here each step

  constructor(ctx: AudioContext, masterGain: GainNode) {
    this.ctx        = ctx;
    this.masterGain = masterGain;
  }

  private midiToFreq(midi: number): number {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  private chordRoot(style: MusicStyle, step: number): number {
    return PROGRESSIONS[style][Math.floor(step / 4) % 4];
  }

  // Weighted random pick: weight[i] ∝ exp(-distance * k)
  private voiceLead(candidates: number[], lastMidi: number, baseOctave: number): number {
    const weights = candidates.map(n => {
      const midi = baseOctave + n;
      return Math.exp(-Math.abs(midi - lastMidi) * 0.28);
    });
    const sum = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * sum;
    for (let i = 0; i < candidates.length; i++) {
      r -= weights[i];
      if (r <= 0) return candidates[i];
    }
    return candidates[candidates.length - 1];
  }

  public playBass(time: number, state: BandState, step: number) {
    // Slow-BPM fill: at lower tempos allow off-beat ghost bass notes
    const slowFill = Math.max(0, (90 - state.bpm) / 90);
    const offBeatOk = step % 4 !== 0
      ? Math.random() < (state.chaos * 0.3 + slowFill * 0.25)
      : true;
    if (!offBeatOk) return;

    const prob = (0.3 + (state.density / 100) * 0.6) * (1 + slowFill * 0.35);
    if (Math.random() > prob) return;

    const root = this.chordRoot(state.style, step);
    const nextRoot = this.chordRoot(state.style, step + 4);

    // Neural bass candidates: chord tones + chromatic approach to next root
    const chordTones = [root, root + 3, root + 5, root + 7];
    const approach   = nextRoot - 1; // chromatic approach from below
    const candidates = step % 4 === 3
      ? [...chordTones, approach]   // approaching next chord — include approach note
      : chordTones;

    const chosen  = this.voiceLead(candidates, this.lastBassMidi, 36);
    const octShift = Math.random() < 0.12 ? -12 : 0; // occasional octave drop
    const midi    = 36 + chosen + (state.keyRoot ?? 0) + octShift;
    this.lastBassMidi = midi;

    const freq = this.midiToFreq(midi);
    const dur  = 0.45;

    // Two detuned sawtooths → LPF for warmth
    for (const detune of [0, 6]) {
      const osc    = this.ctx.createOscillator();
      const filter = this.ctx.createBiquadFilter();
      const gain   = this.ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.value = freq;
      osc.detune.value    = detune;

      filter.type           = 'lowpass';
      filter.frequency.value = 380 + state.chaos * 900;
      filter.Q.value        = 1.6;

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
    const slowFill  = Math.max(0, (90 - state.bpm) / 90);
    // At slow BPMs fill more subdivisions; chaos also opens them up
    const prob = (state.density / 100) * 0.55 + state.chaos * 0.25 + slowFill * 0.3;
    if (Math.random() > prob) return;

    const root  = this.chordRoot(state.style, step);
    const tones = [root, root + 3, root + 7];

    let semitone: number;
    if (Math.random() < 0.68) {
      semitone = tones[Math.floor(Math.random() * tones.length)];
    } else {
      const scale = SCALE_INTERVALS[state.scale] ?? SCALE_INTERVALS.pentatonic;
      semitone    = scale[Math.floor(Math.random() * scale.length)];
    }

    // At slow BPMs, occasionally play a longer note phrase (double duration)
    const octaveBase = Math.random() < 0.25 ? 72 : 60;
    const freq  = this.midiToFreq(octaveBase + semitone + (state.keyRoot ?? 0));
    const durMult = (slowFill > 0.4 && Math.random() < 0.3) ? 1.8 : 1.0;
    const dur   = (0.1 + Math.random() * 0.22) * durMult;

    // Two detuned sawtooths → bandpass for presence
    for (const detune of [-7, 7]) {
      const osc    = this.ctx.createOscillator();
      const filter = this.ctx.createBiquadFilter();
      const gain   = this.ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.value = freq;
      osc.detune.value    = detune;

      filter.type           = 'bandpass';
      filter.frequency.value = 1100 + state.chaos * 2200;
      filter.Q.value        = 2.2;

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
