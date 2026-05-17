import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, Mic, MicOff, AlertTriangle, ShieldCheck, Activity, Zap, Radio, StopCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { AreaChart, Area, ResponsiveContainer, Tooltip, XAxis } from 'recharts';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';
const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8000';

// Wake up sleeping HuggingFace Space before connecting
async function warmBackend() {
  try {
    await fetch(`${BACKEND_URL}/health`, { method: 'GET', signal: AbortSignal.timeout(20000) });
    return true;
  } catch { return false; }
}

// ─── Downsample helper (fixes live mic bug: browser is 44100/48000Hz, model needs 16000Hz)
function downsample(buffer, fromRate, toRate) {
  if (fromRate === toRate) return buffer;
  const ratio = fromRate / toRate;
  const length = Math.floor(buffer.length / ratio);
  const result = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const pos = i * ratio;
    const idx = Math.floor(pos);
    const frac = pos - idx;
    result[i] = idx + 1 < buffer.length
      ? buffer[idx] * (1 - frac) + buffer[idx + 1] * frac
      : buffer[idx];
  }
  return result;
}

// ─── SVG Arc Gauge
function RiskGauge({ score, level }) {
  const pct = Math.min(1, Math.max(0, score));
  const angle = -140 + pct * 280;
  const color = level === 'HIGH RISK' ? '#ef4444' : level === 'MEDIUM RISK' ? '#f59e0b' : '#22c55e';
  const r = 70, cx = 90, cy = 90;
  const polarX = (deg) => cx + r * Math.cos((deg * Math.PI) / 180);
  const polarY = (deg) => cy + r * Math.sin((deg * Math.PI) / 180);
  const arcPath = (start, end) => {
    const s = { x: polarX(start), y: polarY(start) };
    const e = { x: polarX(end), y: polarY(end) };
    const large = Math.abs(end - start) > 180 ? 1 : 0;
    return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y}`;
  };
  return (
    <svg viewBox="0 0 180 120" className="w-full max-w-[220px] mx-auto">
      <path d={arcPath(-220, 40)} fill="none" stroke="#1e293b" strokeWidth="10" strokeLinecap="round"/>
      <motion.path
        d={arcPath(-220, 40)}
        fill="none"
        stroke={color}
        strokeWidth="10"
        strokeLinecap="round"
        strokeDasharray="220"
        initial={{ strokeDashoffset: 220 }}
        animate={{ strokeDashoffset: 220 * (1 - pct) }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        style={{ filter: `drop-shadow(0 0 6px ${color})` }}
      />
      {/* needle */}
      <motion.line
        x1={cx} y1={cy}
        animate={{ x2: polarX(angle - 90), y2: polarY(angle - 90) }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        stroke={color} strokeWidth="2.5" strokeLinecap="round"
      />
      <circle cx={cx} cy={cy} r="5" fill={color} style={{ filter: `drop-shadow(0 0 4px ${color})` }}/>
      <text x={cx} y={cy + 22} textAnchor="middle" fill={color} fontSize="14" fontWeight="700" fontFamily="JetBrains Mono">
        {(pct * 100).toFixed(0)}%
      </text>
      <text x={cx} y={cy + 36} textAnchor="middle" fill="#64748b" fontSize="7" fontFamily="Inter" letterSpacing="1">
        SPOOF PROBABILITY
      </text>
    </svg>
  );
}

// ─── Canvas Waveform
function WaveformCanvas({ analyserRef, isActive, color }) {
  const canvasRef = useRef(null);
  const rafRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      const W = canvas.width, H = canvas.height;
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(2,8,23,0)';
      ctx.fillRect(0, 0, W, H);
      if (analyserRef.current && isActive) {
        const buf = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteTimeDomainData(buf);
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.shadowBlur = 8;
        ctx.shadowColor = color;
        const step = W / buf.length;
        buf.forEach((v, i) => {
          const x = i * step;
          const y = ((v / 128) - 1) * (H / 2) + H / 2;
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        });
        ctx.stroke();
      } else {
        // idle flat line
        ctx.beginPath();
        ctx.strokeStyle = '#1e293b';
        ctx.lineWidth = 1;
        ctx.moveTo(0, H / 2);
        ctx.lineTo(W, H / 2);
        ctx.stroke();
      }
    };
    draw();
    return () => cancelAnimationFrame(rafRef.current);
  }, [analyserRef, isActive, color]);
  return <canvas ref={canvasRef} width={600} height={80} className="w-full h-20 rounded-lg"/>;
}

// ─── Timeline Bar
function TimelineBar({ chunks }) {
  const display = chunks.slice(-20);
  const offset = Math.max(0, chunks.length - 20);
  const getColor = (risk) =>
    risk?.includes('HIGH') ? '#ef4444' : risk?.includes('MEDIUM') ? '#f59e0b' : '#22c55e';
  return (
    <div className="flex gap-1 items-end h-16 w-full">
      {display.map((c, i) => (
        <motion.div
          key={offset + i}
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: `${Math.max(12, c.score * 100)}%`, opacity: 1 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          className="flex-1 rounded-t relative group cursor-default"
          style={{ background: getColor(c.risk), boxShadow: `0 0 6px ${getColor(c.risk)}66` }}
        >
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-slate-900 border border-slate-700 text-[10px] rounded opacity-0 group-hover:opacity-100 whitespace-nowrap z-10 pointer-events-none mono">
            t+{offset + i + 2}s · {(c.score * 100).toFixed(0)}%
          </div>
        </motion.div>
      ))}
      {[...Array(Math.max(0, 10 - display.length))].map((_, i) => (
        <div key={`empty-${i}`} className="flex-1 h-2 rounded bg-slate-800/50 border border-dashed border-slate-700/40"/>
      ))}
    </div>
  );
}

// ─── Verdict Banner
function VerdictBanner({ level, score }) {
  const cfg = {
    'HIGH RISK':   { bg: 'rgba(239,68,68,0.1)',  border: 'rgba(239,68,68,0.4)',  text: '#ef4444', icon: <AlertTriangle className="w-8 h-8"/>, label: 'SYNTHETIC VOICE DETECTED' },
    'MEDIUM RISK': { bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.4)', text: '#f59e0b', icon: <Zap className="w-8 h-8"/>,           label: 'SUSPICIOUS — REVIEW REQUIRED' },
    'REAL':        { bg: 'rgba(34,197,94,0.08)', border: 'rgba(34,197,94,0.35)', text: '#22c55e', icon: <ShieldCheck className="w-8 h-8"/>,   label: 'AUTHENTIC VOICE CONFIRMED' },
    'ANALYZING':   { bg: 'rgba(99,102,241,0.08)',border: 'rgba(99,102,241,0.3)', text: '#818cf8', icon: <Activity className="w-8 h-8 animate-pulse"/>, label: 'ANALYZING AUDIO STREAM...' },
  };
  const c = cfg[level] || cfg['ANALYZING'];
  return (
    <motion.div
      key={level}
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
      className="rounded-2xl p-5 flex items-center gap-4"
      style={{ background: c.bg, border: `1px solid ${c.border}`, boxShadow: `0 0 30px ${c.border}` }}
    >
      <div style={{ color: c.text }}>{c.icon}</div>
      <div>
        <div className="text-xs text-slate-500 font-mono uppercase tracking-widest mb-0.5">Verdict</div>
        <div className="text-xl font-black tracking-tight" style={{ color: c.text }}>{c.label}</div>
        <div className="text-sm text-slate-400 mt-0.5">Confidence: <span className="font-mono font-bold" style={{ color: c.text }}>{(score * 100).toFixed(1)}%</span></div>
      </div>
    </motion.div>
  );
}

// ─── Main Dashboard
export default function Dashboard() {
  const [status, setStatus]         = useState('IDLE'); // IDLE | ANALYZING | FINISHED
  const [isRecording, setIsRecording] = useState(false);
  const [riskScore, setRiskScore]   = useState(0);
  const [riskLevel, setRiskLevel]   = useState('ANALYZING');
  const [chunks, setChunks]         = useState([]);
  const [chartData, setChartData]   = useState([]);
  const [elapsedSec, setElapsedSec] = useState(0);

  const wsRef       = useRef(null);
  const audioCtxRef = useRef(null);
  const streamRef   = useRef(null);
  const processorRef= useRef(null);
  const analyserRef = useRef(null);
  const timerRef    = useRef(null);

  // cleanup on unmount
  useEffect(() => () => stopAll(), []);

  const stopAll = useCallback(() => {
    if (processorRef.current) { processorRef.current.disconnect(); processorRef.current = null; }
    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') { audioCtxRef.current.close(); audioCtxRef.current = null; }
    if (streamRef.current)    { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    if (wsRef.current)        { wsRef.current.close(); wsRef.current = null; }
    if (timerRef.current)     { clearInterval(timerRef.current); timerRef.current = null; }
    setIsRecording(false);
  }, []);

  const resetState = () => {
    setChunks([]); setChartData([]); setRiskScore(0);
    setRiskLevel('ANALYZING'); setElapsedSec(0);
  };

  // ── FILE UPLOAD
  const handleFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    stopAll(); resetState(); setStatus('ANALYZING');
    toast.loading('Waking backend…', { id: 'upload' });
    await warmBackend(); // ping /health to wake HF Space
    toast.loading('Analyzing audio…', { id: 'upload' });
    const form = new FormData();
    form.append('file', f);
    try {
      const res  = await fetch(`${BACKEND_URL}/analyze`, { method: 'POST', body: form });
      const data = await res.json();
      if (data.inference_ms) toast.success(`Done in ${(data.inference_ms/1000).toFixed(1)}s`, { id: 'upload' });
      toast.success('Analysis complete!', { id: 'upload' });
      if (data.results?.length) {
        data.results.forEach((r, idx) => {
          setTimeout(() => {
            setRiskScore(r.verdict.score);
            setRiskLevel(r.verdict.risk);
            setChunks(prev => [...prev, { id: r.second, score: r.verdict.score, risk: r.verdict.risk }]);
            setChartData(prev => [...prev, { t: r.second, score: +(r.verdict.score * 100).toFixed(1) }]);
            if (idx === data.results.length - 1) {
              setRiskScore(data.final_verdict.score);
              setRiskLevel(data.final_verdict.risk);
              setStatus('FINISHED');
            }
          }, idx * 900);
        });
      } else setStatus('FINISHED');
    } catch {
      toast.error('Backend not reachable. Is it running?', { id: 'upload' });
      setStatus('IDLE');
    }
  };

  // ── LIVE MIC — uses AudioWorkletNode (replaces deprecated ScriptProcessorNode)
  const startRecording = async () => {
    stopAll(); resetState(); setStatus('ANALYZING');

    // Step 1: Wake up HF Space first (it may be sleeping)
    const wakeToast = toast.loading('Waking up backend…', { id: 'wake' });
    await warmBackend();
    toast.dismiss('wake');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const ac = new (window.AudioContext || window.webkitAudioContext)();
      audioCtxRef.current = ac;
      const NATIVE_SR = ac.sampleRate;

      // Analyser for waveform
      const analyser = ac.createAnalyser(); analyser.fftSize = 2048;
      analyserRef.current = analyser;
      const src = ac.createMediaStreamSource(stream);
      src.connect(analyser);

      // WebSocket to backend
      const wsProto = BACKEND_URL.startsWith('https') ? 'wss' : 'ws';
      const wsBase  = BACKEND_URL.replace(/^https?/, wsProto);
      const ws = new WebSocket(`${wsBase}/stream`);
      wsRef.current = ws;

      let counter = 0;
      ws.onopen = () => {
        setIsRecording(true);
        timerRef.current = setInterval(() => setElapsedSec(s => s + 1), 1000);
        toast.success('Live stream started ✓');
      };
      ws.onmessage = (ev) => {
        const d = JSON.parse(ev.data);
        if (d.ping) return; // keep-alive from server
        setRiskScore(d.score || 0);
        setRiskLevel(d.risk || 'ANALYZING');
        counter++;
        setChunks(prev => [...prev, { id: counter, score: d.score || 0, risk: d.risk || 'ANALYZING' }]);
        setChartData(prev => [...prev, { t: counter, score: +((d.score || 0) * 100).toFixed(1) }]);
      };
      ws.onerror = () => toast.error('WebSocket error — backend may be sleeping, try again');
      ws.onclose = () => { setIsRecording(false); setStatus(s => s === 'ANALYZING' ? 'FINISHED' : s); };

      // Use AudioWorkletNode if supported (Chrome 66+), fallback to ScriptProcessor
      try {
        await ac.audioWorklet.addModule('/audio-processor.worklet.js');
        const worklet = new AudioWorkletNode(ac, 'chunk-processor', {
          processorOptions: { nativeSR: NATIVE_SR }
        });
        processorRef.current = worklet;
        worklet.port.onmessage = (e) => {
          const raw   = new Float32Array(e.data);
          const chunk = downsample(raw, NATIVE_SR, 16000);
          if (ws.readyState === WebSocket.OPEN) ws.send(chunk.buffer);
        };
        src.connect(worklet);
        worklet.connect(ac.destination);
      } catch {
        // Fallback: ScriptProcessor (still works, just deprecated)
        const proc = ac.createScriptProcessor(4096, 1, 1);
        processorRef.current = proc;
        let accumBuf = new Float32Array(0);
        proc.onaudioprocess = (ev) => {
          const input = ev.inputBuffer.getChannelData(0);
          const merged = new Float32Array(accumBuf.length + input.length);
          merged.set(accumBuf, 0); merged.set(input, accumBuf.length);
          accumBuf = merged;
          if (accumBuf.length >= NATIVE_SR) {
            const raw = accumBuf.slice(0, NATIVE_SR);
            accumBuf  = accumBuf.slice(NATIVE_SR);
            const chunk = downsample(raw, NATIVE_SR, 16000);
            if (ws.readyState === WebSocket.OPEN) ws.send(chunk.buffer);
          }
        };
        src.connect(proc);
        proc.connect(ac.destination);
      }

    } catch (err) {
      toast.error('Microphone access denied or not available');
      setStatus('IDLE');
    }
  };

  const stopRecording = () => {
    stopAll();
    setStatus(chunks.length > 0 ? 'FINISHED' : 'IDLE');
  };

  const handleReset = () => { stopAll(); resetState(); setStatus('IDLE'); };

  const waveColor = riskLevel === 'HIGH RISK' ? '#ef4444' : riskLevel === 'MEDIUM RISK' ? '#f59e0b' : '#22c55e';
  const displayLevel = status === 'IDLE' ? 'ANALYZING' : riskLevel;

  // Custom recharts tooltip
  const ChartTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs mono">
        <div className="text-slate-400">t+{payload[0]?.payload?.t}s</div>
        <div className="text-white font-bold">{payload[0]?.value}% spoof</div>
      </div>
    );
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.3 }}>
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <h1 className="text-3xl font-black tracking-tight">Detection Dashboard</h1>
          {status === 'ANALYZING' && (
            <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-mono uppercase tracking-widest">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500" style={{ animation: 'pulse 1.5s infinite' }}/>
              Live
            </span>
          )}
        </div>
        <p className="text-slate-500 text-sm">Real-time deepfake audio detection using AASIST-L · <span className="text-slate-400">Upload a file or stream from microphone</span></p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* ── LEFT COLUMN: Controls + Gauge */}
        <div className="space-y-5">

          {/* Verdict + Gauge */}
          <div className="card p-6 space-y-4">
            <VerdictBanner level={displayLevel} score={riskScore}/>
            <RiskGauge score={riskScore} level={displayLevel}/>
            {status === 'ANALYZING' && isRecording && (
              <div className="text-center font-mono text-slate-500 text-xs">
                ELAPSED: <span className="text-slate-300">{elapsedSec}s</span> · WINDOWS: <span className="text-slate-300">{chunks.length}</span>
              </div>
            )}
          </div>

          {/* Input Controls */}
          <div className="card p-6 space-y-4">
            <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-widest">Input Source</h3>

            {/* File upload */}
            <label className="block">
              <input type="file" accept=".wav,.mp3,.flac,audio/*" className="hidden" onChange={handleFile} disabled={status === 'ANALYZING'}/>
              <div className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-dashed cursor-pointer transition-all text-sm font-medium
                ${status === 'ANALYZING' ? 'opacity-40 cursor-not-allowed border-slate-700 text-slate-600' : 'border-slate-600 text-slate-300 hover:border-indigo-500/60 hover:text-indigo-300 hover:bg-indigo-500/5'}`}>
                <Upload className="w-4 h-4"/>Upload Audio File
              </div>
            </label>

            <div className="flex items-center gap-3 text-slate-700 text-xs"><div className="flex-1 h-px bg-slate-800"/><span>or</span><div className="flex-1 h-px bg-slate-800"/></div>

            {/* Mic button */}
            {!isRecording ? (
              <button
                onClick={startRecording}
                disabled={status === 'ANALYZING' && !isRecording}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-semibold text-sm transition-all bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ boxShadow: '0 0 20px rgba(99,102,241,0.25)' }}
              >
                <Mic className="w-4 h-4"/><Radio className="w-3 h-3 animate-pulse"/>Start Live Mic Stream
              </button>
            ) : (
              <button
                onClick={stopRecording}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-semibold text-sm transition-all bg-red-600 hover:bg-red-500 text-white"
                style={{ boxShadow: '0 0 20px rgba(239,68,68,0.3)' }}
              >
                <StopCircle className="w-4 h-4"/>Stop Streaming
              </button>
            )}

            {(status === 'FINISHED' || chunks.length > 0) && (
              <button onClick={handleReset} className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-all">
                <MicOff className="w-3.5 h-3.5"/>Reset
              </button>
            )}
          </div>
        </div>

        {/* ── RIGHT COLUMN: Visualisations */}
        <div className="xl:col-span-2 space-y-5">

          {/* Waveform */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-widest">Live Waveform</h3>
              {status === 'ANALYZING' && isRecording && (
                <span className="text-[10px] font-mono text-slate-600">16 kHz · mono · float32</span>
              )}
            </div>
            <WaveformCanvas analyserRef={analyserRef} isActive={isRecording} color={waveColor}/>
          </div>

          {/* Score chart */}
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-widest mb-3">Spoof Score History</h3>
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={120}>
                <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="scoreGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={waveColor} stopOpacity={0.3}/>
                      <stop offset="95%" stopColor={waveColor} stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="t" tick={{ fill: '#475569', fontSize: 10, fontFamily: 'JetBrains Mono' }} tickLine={false} axisLine={false}/>
                  <Tooltip content={<ChartTooltip/>}/>
                  <Area type="monotone" dataKey="score" stroke={waveColor} strokeWidth={2} fill="url(#scoreGrad)" dot={false} animationDuration={300}/>
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[120px] flex items-center justify-center text-slate-700 text-sm italic">Waiting for audio data…</div>
            )}
          </div>

          {/* Timeline */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-widest">Per-Window Timeline</h3>
              <span className="text-[10px] font-mono text-slate-600">2s window · 1s step · showing last 20</span>
            </div>
            <TimelineBar chunks={chunks}/>
            <div className="flex justify-between text-[10px] font-mono text-slate-700 mt-1">
              <span>+2s</span><span>+6s</span><span>+10s</span><span>+14s</span><span>+18s</span><span>+22s</span>
            </div>
          </div>

          {/* Rolling log */}
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-widest mb-3">Analysis Log</h3>
            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {chunks.length === 0 ? (
                <div className="text-slate-700 text-sm italic text-center py-8">Waiting for audio stream…</div>
              ) : (
                [...chunks].reverse().map((c) => {
                  const col = c.risk?.includes('HIGH') ? 'text-red-400' : c.risk?.includes('MEDIUM') ? 'text-amber-400' : 'text-emerald-400';
                  return (
                    <motion.div key={c.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                      className="flex items-center justify-between bg-slate-900/60 border border-slate-800/60 rounded-lg px-3 py-2">
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-slate-600 text-xs">t+{c.id}s</span>
                        <span className={`text-xs font-semibold ${col}`}>{c.risk}</span>
                      </div>
                      <span className="font-mono text-xs text-slate-400">{(c.score * 100).toFixed(1)}%</span>
                    </motion.div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
