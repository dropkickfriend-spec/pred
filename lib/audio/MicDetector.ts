export class MicDetector {
  private ctx: AudioContext;
  private analyser: AnalyserNode;
  private source: MediaStreamAudioSourceNode | null = null;
  private stream: MediaStream | null = null;
  private active = false;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 8192;
    this.analyser.smoothingTimeConstant = 0.8;
  }

  async start(): Promise<void> {
    if (this.active) return;
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    this.source = this.ctx.createMediaStreamSource(this.stream);
    this.source.connect(this.analyser);
    this.active = true;
  }

  stop(): void {
    this.source?.disconnect();
    this.stream?.getTracks().forEach(t => t.stop());
    this.source = null;
    this.stream = null;
    this.active = false;
  }

  get isActive(): boolean {
    return this.active;
  }

  detectPitch(): number | null {
    if (!this.active) return null;
    const binCount = this.analyser.frequencyBinCount;
    const data = new Float32Array(binCount);
    this.analyser.getFloatFrequencyData(data);

    const freqPerBin = this.ctx.sampleRate / this.analyser.fftSize;
    const minBin = Math.max(1, Math.floor(80 / freqPerBin));
    const maxBin = Math.min(binCount - 1, Math.floor(2000 / freqPerBin));

    let peakBin = minBin;
    let peakVal = -Infinity;
    for (let i = minBin; i <= maxBin; i++) {
      if (data[i] > peakVal) { peakVal = data[i]; peakBin = i; }
    }

    // -55 dBFS noise floor
    if (peakVal < -55) return null;
    return peakBin * freqPerBin;
  }

  static freqToNote(hz: number): string {
    const midi = 69 + 12 * Math.log2(hz / 440);
    const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    return notes[((Math.round(midi) % 12) + 12) % 12];
  }
}
