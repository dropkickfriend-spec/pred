export type MusicStyle = 'EDM' | 'HipHop' | 'Jazz' | 'African' | 'Indian';

export interface BandState {
  bpm: number;
  swing: number;
  chaos: number;
  density: number;
  style: MusicStyle;
  isPlaying: boolean;
  scale: string;
  keyRoot: number; // 0=C 1=C# 2=D … 11=B — transpose offset applied to all notes
}

export interface AudioEvent {
  type: 'kick' | 'snare' | 'hihat' | 'cymbal' | 'bass' | 'mid' | 'lead';
  time: number;
  velocity: number;
  pitch?: number;
  pan?: number;
}
