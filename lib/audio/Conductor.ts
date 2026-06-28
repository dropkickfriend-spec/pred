import { BandState } from './types';

export class Conductor {
  private ctx: AudioContext;
  private lookahead = 25.0; // ms
  private scheduleAheadTime = 0.1; // s
  private nextNoteTime = 0.0;
  private current16thNote = 0;
  private timerID: number | null = null;
  private running = false;
  private state: BandState;
  private onBeat: (step: number, time: number) => void;

  constructor(ctx: AudioContext, state: BandState, onBeat: (step: number, time: number) => void) {
    this.ctx = ctx;
    this.state = state;
    this.onBeat = onBeat;
  }

  public start() {
    if (this.running) return;
    this.running = true;
    this.nextNoteTime = this.ctx.currentTime + 0.05;
    this.current16thNote = 0;
    this.scheduler();
  }

  public stop() {
    if (this.timerID) {
      window.clearTimeout(this.timerID);
      this.timerID = null;
    }
    this.running = false;
  }

  private scheduler() {
    while (this.nextNoteTime < this.ctx.currentTime + this.scheduleAheadTime) {
      this.scheduleNote(this.current16thNote, this.nextNoteTime);
      this.advanceNote();
    }
    this.timerID = window.setTimeout(() => this.scheduler(), this.lookahead);
  }

  private advanceNote() {
    const secondsPerBeat = 60.0 / this.state.bpm;
    const stepDuration = 0.25 * secondsPerBeat;

    // Apply swing to odd-numbered 16th notes
    let swingOffset = 0;
    if (this.current16thNote % 2 !== 0) {
      swingOffset = (this.state.swing / 100) * stepDuration * 0.33;
    }

    this.nextNoteTime += stepDuration + swingOffset;
    this.current16thNote = (this.current16thNote + 1) % 16;
  }

  private scheduleNote(step: number, time: number) {
    this.onBeat(step, time);
  }

  public updateState(newState: Partial<BandState>) {
    this.state = { ...this.state, ...newState };
  }
}
