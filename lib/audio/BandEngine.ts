import { BandState } from './types';

export class BandEngine {
  private ctx: AudioContext;
  private masterGain: GainNode;

  constructor(ctx: AudioContext, masterGain: GainNode) {
    this.ctx = ctx;
    this.masterGain = masterGain;
  }

  private getScaleNotes(scale: string): number[] {
    const scales: Record<string, number[]> = {
      pentatonic: [0, 2, 4, 7, 9],
      minor: [0, 2, 3, 5, 7, 8, 10],
      major: [0, 2, 4, 5, 7, 9, 11],
      blues: [0, 3, 5, 6, 7, 10],
    };
    return scales[scale] || scales.pentatonic;
  }

  private midiToFreq(midi: number): number {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  public playBass(time: number, state: BandState, step: number) {
    // Base probability from density (0.1–0.9), restricted to beat positions unless chaos opens it up
    const densityProb = 0.1 + (state.density / 100) * 0.8;
    if (step % 4 !== 0 && Math.random() > state.chaos) return;
    if (Math.random() > densityProb) return;

    const scale = this.getScaleNotes(state.scale);
    const root = 36; // C2
    const note = scale[Math.floor(Math.random() * scale.length)];
    const freq = this.midiToFreq(root + note);

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, time);

    gain.gain.setValueAtTime(0.3, time);
    gain.gain.exponentialRampToValueAtTime(0.01, time + 0.5);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(time);
    osc.stop(time + 0.5);
  }

  public playLead(time: number, state: BandState, _step: number) {
    // Density scales the base play probability; chaos adds extra spread
    const densityProb = (state.density / 100) * 0.5 + state.chaos * 0.3;
    if (Math.random() > densityProb) return;

    const scale = this.getScaleNotes(state.scale);
    const root = 60; // C4
    const note = scale[Math.floor(Math.random() * scale.length)];
    const freq = this.midiToFreq(root + note);

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, time);

    if (state.chaos > 0.5) {
      const lfo = this.ctx.createOscillator();
      const lfoGain = this.ctx.createGain();
      lfo.frequency.value = 5;
      lfoGain.gain.value = 10 * state.chaos;
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      lfo.start(time);
      lfo.stop(time + 0.3);
    }

    gain.gain.setValueAtTime(0.1, time);
    gain.gain.exponentialRampToValueAtTime(0.01, time + 0.3);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(time);
    osc.stop(time + 0.3);
  }
}
