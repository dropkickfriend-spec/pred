/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { Play, Pause, Music, Zap, Layers, Activity, Disc, Radio, Globe, Mic, MicOff } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { AreaChart, Area, ResponsiveContainer, Tooltip } from 'recharts';
import { Conductor } from './lib/audio/Conductor';
import { DrumEngine } from './lib/audio/DrumEngine';
import { BandEngine } from './lib/audio/BandEngine';
import { MicDetector } from './lib/audio/MicDetector';
import { ThreeVisualEngine } from './lib/visuals/ThreeVisualEngine';
import { BandState, MusicStyle } from './lib/audio/types';
import { supabase } from './lib/supabaseClient';

const INITIAL_STATE: BandState = {
  bpm: 128,
  swing: 0,
  chaos: 0.3,
  density: 50,
  style: 'EDM',
  isPlaying: false,
  scale: 'pentatonic',
};

interface ChartPoint { t: number; chaos: number; density: number; }

export default function App() {
  const [state, setState] = useState<BandState>(INITIAL_STATE);
  const [xp, setXp] = useState(0);
  const [bootLog, setBootLog] = useState<string[]>([]);
  const [isBooted, setIsBooted] = useState(false);
  const [chartData, setChartData] = useState<ChartPoint[]>([]);
  const [syncHeight, setSyncHeight] = useState(0);
  const [micActive, setMicActive] = useState(false);
  const [detectedKey, setDetectedKey] = useState<string | null>(null);

  const audioCtxRef    = useRef<AudioContext | null>(null);
  const masterGainRef  = useRef<GainNode | null>(null);
  const conductorRef   = useRef<Conductor | null>(null);
  const drumEngineRef  = useRef<DrumEngine | null>(null);
  const bandEngineRef  = useRef<BandEngine | null>(null);
  const visualEngineRef= useRef<ThreeVisualEngine | null>(null);
  const canvasRef      = useRef<HTMLCanvasElement | null>(null);
  const sessionStartRef= useRef<number>(0);
  const sessionXpRef   = useRef<number>(0);
  // stateRef keeps conductor callback in sync without re-creating it
  const stateRef       = useRef<BandState>(INITIAL_STATE);
  const xpRef          = useRef<number>(0);
  const micRef         = useRef<MicDetector | null>(null);
  const micPollRef     = useRef<number>(0);
  const tapTimesRef    = useRef<number[]>([]);

  useEffect(() => {
    supabase.from('sessions').select('*', { count: 'exact', head: true })
      .then(({ count }) => setSyncHeight(count ?? 0));
  }, []);

  useEffect(() => {
    const logs = [
      'INITIALIZING CLUSTER...',
      'LOADING AUDIO BUFFERS...',
      'SYNCING 1-BIT BLOCKCHAIN...',
      'CALIBRATING HARMONY BRAIN...',
      'ESTABLISHING TEMPORAL GRID...',
      'READY FOR SPLASHDOWN.',
    ];
    let i = 0;
    const iv = setInterval(() => {
      if (i < logs.length) { setBootLog(prev => [...prev, logs[i]]); i++; }
      else clearInterval(iv);
    }, 400);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    return () => {
      visualEngineRef.current?.dispose();
      clearInterval(micPollRef.current);
      micRef.current?.stop();
    };
  }, []);

  const initAudio = () => {
    if (audioCtxRef.current) return;

    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const masterGain = ctx.createGain();
    masterGain.gain.value = 1.2;
    masterGain.connect(ctx.destination);

    const drumEngine = new DrumEngine(ctx, masterGain);
    const bandEngine = new BandEngine(ctx, masterGain);

    const conductor = new Conductor(ctx, stateRef.current, (step, time) => {
      const s = stateRef.current;

      // micro-timing humanization: slight random offset scaled by chaos
      const jitter = (Math.random() - 0.5) * 0.006 * s.chaos;
      const t = time + jitter;

      const pattern = drumEngine.getPattern(s.style, step, s.chaos);

      if (pattern.kick) {
        drumEngine.playKick(t, pattern.kick);
        visualEngineRef.current?.addPulse('kick', '#ef4444');
      }
      if (pattern.snare) {
        drumEngine.playSnare(t, pattern.snare);
        visualEngineRef.current?.addPulse('snare', '#f59e0b');
      }
      if (pattern.hihat) {
        drumEngine.playHiHat(t, pattern.hihat, step % 8 === 7);
        visualEngineRef.current?.addPulse('hihat', '#22d3ee');
      }

      bandEngine.playBass(t, s, step);
      bandEngine.playLead(t, s, step);

      const earned = Math.floor(s.density * 0.1 + s.chaos * 5);
      xpRef.current += earned;
      setXp(xpRef.current);

      if (step % 4 === 0) {
        setChartData(prev => [
          ...prev.slice(-32),
          { t: prev.length, chaos: Math.round(s.chaos * 100), density: s.density },
        ]);
      }
    });

    audioCtxRef.current = ctx;
    masterGainRef.current = masterGain;
    drumEngineRef.current = drumEngine;
    bandEngineRef.current = bandEngine;
    conductorRef.current  = conductor;

    if (canvasRef.current) {
      visualEngineRef.current = new ThreeVisualEngine(canvasRef.current, stateRef.current);
    }

    setIsBooted(true);
  };

  const togglePlay = () => {
    if (!isBooted) { initAudio(); return; }
    if (stateRef.current.isPlaying) {
      conductorRef.current?.stop();
      const duration = Math.floor((Date.now() - sessionStartRef.current) / 1000);
      supabase.from('sessions').insert({
        style:            stateRef.current.style,
        scale:            stateRef.current.scale,
        bpm:              stateRef.current.bpm,
        swing:            stateRef.current.swing,
        chaos:            Number(stateRef.current.chaos.toFixed(3)),
        density:          stateRef.current.density,
        xp_earned:        xpRef.current - sessionXpRef.current,
        duration_seconds: duration,
      }).then(({ error }) => {
        if (!error) setSyncHeight(h => h + 1);
      });
    } else {
      sessionStartRef.current = Date.now();
      sessionXpRef.current = xpRef.current;
      if (audioCtxRef.current?.state === 'suspended') audioCtxRef.current.resume();
      conductorRef.current?.start();
    }
    setState(prev => {
      const next = { ...prev, isPlaying: !prev.isPlaying };
      stateRef.current = next;
      return next;
    });
  };

  const updateState = (updates: Partial<BandState>) => {
    setState(prev => {
      const next = { ...prev, ...updates };
      stateRef.current = next;
      conductorRef.current?.updateState(next);
      visualEngineRef.current?.updateState(next);
      return next;
    });
  };

  const tapTempo = () => {
    const now = Date.now();
    tapTimesRef.current = [...tapTimesRef.current.slice(-7), now];
    if (tapTimesRef.current.length >= 2) {
      const intervals = tapTimesRef.current
        .slice(1)
        .map((t, i) => t - tapTimesRef.current[i]);
      const avg = intervals.reduce((a, b) => a + b) / intervals.length;
      const bpm = Math.round(60000 / avg);
      if (bpm >= 60 && bpm <= 200) updateState({ bpm });
    }
  };

  const toggleMic = async () => {
    if (!audioCtxRef.current) return;
    if (micActive) {
      micRef.current?.stop();
      clearInterval(micPollRef.current);
      setMicActive(false);
      setDetectedKey(null);
    } else {
      if (!micRef.current) micRef.current = new MicDetector(audioCtxRef.current);
      await micRef.current.start();
      setMicActive(true);
      micPollRef.current = window.setInterval(() => {
        const hz = micRef.current?.detectPitch();
        if (hz != null) setDetectedKey(MicDetector.freqToNote(hz));
      }, 200);
    }
  };

  const styles: { id: MusicStyle; label: string; color: string; icon: any }[] = [
    { id: 'EDM',    label: 'EDM',    color: '#22d3ee', icon: Disc },
    { id: 'HipHop', label: 'Hip-Hop',color: '#8b5cf6', icon: Radio },
    { id: 'Jazz',   label: 'Jazz',   color: '#f59e0b', icon: Music },
    { id: 'African',label: 'African',color: '#ef4444', icon: Globe },
    { id: 'Indian', label: 'Indian', color: '#f97316', icon: Activity },
  ];

  return (
    <div className="h-screen w-screen bg-[#050810] text-[#c8d8e8] font-mono overflow-hidden flex flex-col">
      <AnimatePresence>
        {!isBooted && (
          <motion.div
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[999] bg-[#050810]/95 flex flex-col items-center justify-center p-8"
          >
            <h1 className="text-[#22d3ee] text-2xl font-bold tracking-[4px] mb-8 drop-shadow-[0_0_15px_rgba(34,211,238,0.5)]">
              LIVE AI BAND
            </h1>
            <div className="w-full max-w-lg h-64 bg-[#02040a] border border-[#1a2540] rounded p-4 overflow-y-auto mb-8 text-[#4af] text-xs leading-relaxed">
              {bootLog.map((log, i) => (
                <div key={i} className="mb-1">{`> ${log}`}</div>
              ))}
            </div>
            <button
              onClick={initAudio}
              className="px-12 py-4 border-2 border-[#22d3ee] text-[#22d3ee] font-bold tracking-[3px] rounded hover:bg-[#22d3ee]/10 transition-all shadow-[0_0_20px_rgba(34,211,238,0.3)]"
            >
              INITIALIZE ENGINE
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* HUD */}
      <header className="h-11 bg-[#0a0f1e] border-b border-[#1a2540] flex items-center px-4 gap-4 z-50">
        <span className="text-[#22d3ee] font-bold text-sm tracking-widest">LIVE AI BAND</span>
        <div className="h-4 w-[1px] bg-[#1a2540]" />
        <nav className="flex gap-4 text-[10px] text-[#4a5a7a]">
          <a href="#" className="hover:text-[#22d3ee] transition-colors">PROJECTS</a>
          <a href="#" className="hover:text-[#22d3ee] transition-colors">TOPOLOGY</a>
        </nav>
        <div className="h-4 w-[1px] bg-[#1a2540]" />
        <div className="text-[10px] text-[#22d3ee] tracking-tighter uppercase">{state.style}</div>
        <div className="text-[10px] text-[#4a5a7a]">BPM <span className="text-[#22d3ee]">{state.bpm}</span></div>
        <div className="text-[10px] text-[#4a5a7a]">CHAOS <span className="text-[#22d3ee]">{Math.round(state.chaos * 100)}%</span></div>
        {detectedKey && (
          <div className="text-[10px] text-[#f97316]">KEY <span className="text-[#f97316] font-bold">{detectedKey}</span></div>
        )}
        <div className="ml-auto flex items-center gap-3 text-[10px] text-[#4a5a7a]">
          <span>XP {xp}</span>
          <div className="w-20 h-1.5 bg-[#1a2540] rounded-full overflow-hidden">
            <motion.div className="h-full bg-[#22d3ee]" animate={{ width: `${(xp % 1000) / 10}%` }} />
          </div>
        </div>
      </header>

      <main className="flex-1 relative flex overflow-hidden">
        {/* Left Panel */}
        <aside className="w-40 bg-[#0a0f1e] border-r border-[#1a2540] p-3 flex flex-col gap-4 z-40">
          <div>
            <div className="text-[9px] text-[#4a5a7a] uppercase tracking-widest mb-2">Style</div>
            <div className="flex flex-col gap-1.5">
              {styles.map(s => (
                <button
                  key={s.id}
                  onClick={() => updateState({ style: s.id })}
                  className={`flex items-center gap-2 w-full p-1.5 border rounded text-[10px] transition-all text-left ${
                    state.style === s.id
                      ? 'border-[#22d3ee] bg-[#22d3ee]/10 text-[#22d3ee]'
                      : 'border-[#1a2540] text-[#c8d8e8] hover:border-[#22d3ee]/50'
                  }`}
                >
                  <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: s.color }} />
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div className="border-t border-[#1a2540] pt-4">
            <div className="text-[9px] text-[#4a5a7a] uppercase tracking-widest mb-2">Scale</div>
            <div className="grid grid-cols-2 gap-1.5">
              {['pentatonic', 'minor', 'blues', 'major'].map(s => (
                <button
                  key={s}
                  onClick={() => updateState({ scale: s })}
                  className={`p-1 border rounded text-[9px] transition-all ${
                    state.scale === s
                      ? 'border-[#22d3ee] text-[#22d3ee]'
                      : 'border-[#1a2540] text-[#4a5a7a] hover:border-[#22d3ee]/50'
                  }`}
                >
                  {s.slice(0, 5)}
                </button>
              ))}
            </div>
          </div>

          <div className="border-t border-[#1a2540] pt-4 mt-auto">
            <div className="text-[9px] text-[#4a5a7a] uppercase tracking-widest mb-2">Drag to orbit</div>
            <div className="text-[8px] text-[#2a3a5a] leading-relaxed">
              Rotate the 3D scene with mouse or touch
            </div>
          </div>
        </aside>

        {/* Three.js Canvas */}
        <div className="flex-1 relative">
          <canvas ref={canvasRef} className="w-full h-full block" />
          <div className="absolute top-4 left-4 pointer-events-none">
            <div className="text-[9px] text-[#4a5a7a] uppercase tracking-widest mb-1">Visual Telemetry</div>
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span className="text-[8px] text-[#4a5a7a] w-12">CHAOS</span>
                <div className="w-24 h-1 bg-[#1a2540] rounded-full overflow-hidden">
                  <motion.div className="h-full bg-[#f43f5e]" animate={{ width: `${state.chaos * 100}%` }} />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[8px] text-[#4a5a7a] w-12">DENSITY</span>
                <div className="w-24 h-1 bg-[#1a2540] rounded-full overflow-hidden">
                  <motion.div className="h-full bg-[#22d3ee]" animate={{ width: `${state.density}%` }} />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Panel */}
        <aside className="w-52 bg-[#0a0f1e] border-l border-[#1a2540] p-3 flex flex-col gap-4 z-40 overflow-y-auto">
          <div>
            <div className="text-[9px] text-[#4a5a7a] uppercase tracking-widest mb-2">Entropy Feed</div>
            <div className="w-full h-24 bg-[#050810] border border-[#1a2540] rounded overflow-hidden">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="gChaos" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#f43f5e" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#f43f5e" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gDensity" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#22d3ee" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#22d3ee" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Tooltip
                    contentStyle={{ background: '#02040a', border: '1px solid #1a2540', fontSize: 9 }}
                    itemStyle={{ color: '#22d3ee' }}
                  />
                  <Area type="monotone" dataKey="chaos"   stroke="#f43f5e" fill="url(#gChaos)"   strokeWidth={1.5} dot={false} isAnimationActive={false} />
                  <Area type="monotone" dataKey="density" stroke="#22d3ee" fill="url(#gDensity)" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="flex gap-3 mt-1">
              <span className="text-[8px] text-[#f43f5e]">■ chaos</span>
              <span className="text-[8px] text-[#22d3ee]">■ density</span>
            </div>
          </div>

          <div className="border-t border-[#1a2540] pt-4">
            <div className="text-[9px] text-[#4a5a7a] uppercase tracking-widest mb-2">Chain Log</div>
            <div className="bg-[#050810] border border-[#1a2540] rounded p-2 text-[9px] text-[#4a5a7a] h-32 overflow-hidden flex flex-col gap-1">
              <div className="text-[#22d3ee]">{`> BLOCK_DECODED: ${state.style}_MATTER`}</div>
              <div>{`> SYNC_HEIGHT: ${syncHeight}`}</div>
              <div>{`> ENTROPY_LEVEL: ${state.chaos.toFixed(3)}`}</div>
              <div>{`> HARMONY_LOCK: ${state.scale.toUpperCase()}`}</div>
              <div>{`> PARTICLES: 1400`}</div>
              <div className="text-[#22d3ee]/50">{`> BPM_CLOCK: ${state.bpm}`}</div>
              {detectedKey && (
                <div className="text-[#f97316]">{`> MIC_KEY: ${detectedKey}`}</div>
              )}
            </div>
          </div>

          <div className="border-t border-[#1a2540] pt-4">
            <div className="text-[9px] text-[#4a5a7a] uppercase tracking-widest mb-2">System</div>
            <div className="space-y-1.5">
              {[
                { label: 'RENDERER', val: 'WebGL / Three.js' },
                { label: 'ENGINE',   val: 'Web Audio API' },
                { label: 'STYLES',   val: '5 genres' },
                { label: 'SCALES',   val: '4 modes' },
              ].map(({ label, val }) => (
                <div key={label} className="flex justify-between text-[8px]">
                  <span className="text-[#4a5a7a]">{label}</span>
                  <span className="text-[#22d3ee]/70">{val}</span>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </main>

      {/* Bottom Controls */}
      <footer className="h-24 bg-[#0a0f1e] border-t border-[#1a2540] flex items-center px-4 gap-4 z-50">
        <ControlSlider label="BPM"     value={state.bpm}                     min={60}  max={200} onChange={v => updateState({ bpm: v })} />
        <div className="w-[1px] h-10 bg-[#1a2540]" />
        <ControlSlider label="Swing"   value={state.swing}                   min={0}   max={100} unit="%" onChange={v => updateState({ swing: v })} />
        <div className="w-[1px] h-10 bg-[#1a2540]" />
        <ControlSlider label="Chaos"   value={Math.round(state.chaos * 100)} min={0}   max={100} unit="%" onChange={v => updateState({ chaos: v / 100 })} />
        <div className="w-[1px] h-10 bg-[#1a2540]" />
        <ControlSlider label="Density" value={state.density}                 min={0}   max={100} onChange={v => updateState({ density: v })} />
        <div className="w-[1px] h-10 bg-[#1a2540]" />

        <div className="flex flex-col gap-1.5 items-center">
          <button
            onClick={togglePlay}
            className="px-6 py-2 border-2 border-[#22d3ee] text-[#22d3ee] font-bold tracking-widest rounded hover:bg-[#22d3ee]/10 transition-all flex items-center gap-2 text-xs"
          >
            {state.isPlaying ? <Pause size={13} fill="currentColor" /> : <Play size={13} fill="currentColor" />}
            {state.isPlaying ? 'STOP' : 'PLAY'}
          </button>
          <div className="flex gap-1.5">
            <button
              onClick={tapTempo}
              disabled={!isBooted}
              className="px-3 py-1 border border-[#1a2540] text-[#4a5a7a] text-[9px] rounded hover:border-[#22d3ee]/50 hover:text-[#22d3ee] transition-all disabled:opacity-30"
            >
              TAP
            </button>
            <button
              onClick={toggleMic}
              disabled={!isBooted}
              className={`px-2 py-1 border text-[9px] rounded transition-all disabled:opacity-30 flex items-center gap-1 ${
                micActive
                  ? 'border-[#f97316] text-[#f97316] bg-[#f97316]/10'
                  : 'border-[#1a2540] text-[#4a5a7a] hover:border-[#f97316]/50 hover:text-[#f97316]'
              }`}
            >
              {micActive ? <MicOff size={10} /> : <Mic size={10} />}
              MIC
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}

function ControlSlider({ label, value, min, max, unit = '', onChange }: {
  label: string; value: number; min: number; max: number; unit?: string; onChange: (v: number) => void;
}) {
  return (
    <div className="flex-1 flex flex-col gap-2">
      <div className="flex justify-between text-[9px] text-[#4a5a7a] uppercase tracking-wider">
        <span>{label}</span>
        <span className="text-[#22d3ee]">{value}{unit}</span>
      </div>
      <input
        type="range" min={min} max={max} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full h-1 bg-[#1a2540] rounded-full appearance-none cursor-pointer accent-[#22d3ee]"
      />
    </div>
  );
}
