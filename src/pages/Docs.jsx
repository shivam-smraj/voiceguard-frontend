import React from 'react';
import { motion } from 'framer-motion';
import { Terminal, Zap, Radio, Package, AlertTriangle } from 'lucide-react';

const Section = ({ icon, title, color, children }) => (
  <motion.section initial={{ opacity:0, y:15 }} animate={{ opacity:1, y:0 }} transition={{ duration:.3 }} className="mb-10">
    <div className="flex items-center gap-3 mb-5">
      <div className="p-2 rounded-lg" style={{ background: `${color}18`, color }}>{icon}</div>
      <h2 className="text-xl font-bold text-white">{title}</h2>
    </div>
    {children}
  </motion.section>
);

const Code = ({ children, lang = '' }) => (
  <div className="relative">
    {lang && <span className="absolute top-3 right-3 text-[10px] font-mono text-slate-600 uppercase tracking-widest">{lang}</span>}
    <pre className="bg-[#020817] border border-slate-800 rounded-xl p-5 overflow-x-auto text-sm font-mono text-slate-300 leading-relaxed">{children}</pre>
  </div>
);

const Badge = ({ children, color }) => (
  <span className="inline-block px-2 py-0.5 rounded text-xs font-bold font-mono mr-2" style={{ background: `${color}22`, color }}>{children}</span>
);

export default function Docs() {
  return (
    <motion.div initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-10 }} transition={{ duration:.3 }}
      className="max-w-4xl mx-auto">
      <div className="mb-10">
        <h1 className="text-4xl font-black tracking-tight mb-2">API Documentation</h1>
        <p className="text-slate-500">VoiceGuard AI · AASIST-L Backend Reference</p>
      </div>

      <Section icon={<Terminal className="w-5 h-5"/>} title="System Architecture" color="#818cf8">
        <div className="bg-[#020817] border border-slate-800 rounded-xl p-6 font-mono text-xs text-slate-400 leading-7">
          <div className="text-indigo-400">┌─ VoiceGuard AI Architecture ──────────────────────────────┐</div>
          <div>│</div>
          <div>│  Browser / Phone Call</div>
          <div>│    ↓  PCM audio (1s chunks, 16kHz, float32)</div>
          <div>│  <span className="text-amber-400">WebSocket /stream</span>  ←→  FastAPI Backend</div>
          <div>│                           ↓</div>
          <div>│                      SlidingWindowBuffer (2s, step 1s)</div>
          <div>│                           ↓</div>
          <div>│                      <span className="text-green-400">AASIST-L ONNX Model</span> (~200K params)</div>
          <div>│                           ↓  logits → softmax → P(spoof)</div>
          <div>│                      RiskAggregator (weighted rolling avg)</div>
          <div>│                           ↓</div>
          <div>│                      JSON verdict → Frontend</div>
          <div>│</div>
          <div className="text-indigo-400">└───────────────────────────────────────────────────────────┘</div>
        </div>
      </Section>

      <Section icon={<Zap className="w-5 h-5"/>} title="REST API — POST /analyze" color="#22c55e">
        <p className="text-slate-400 text-sm mb-4">Upload a full audio file. Returns per-second analysis for the <strong className="text-white">entire audio</strong> (not capped at 10s).</p>
        <div className="bg-[#020817] border border-slate-800 rounded-xl px-4 py-3 font-mono text-sm mb-4">
          <Badge color="#22c55e">POST</Badge><span className="text-white">http://&lt;backend&gt;/analyze</span>
        </div>
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-widest mb-2">Request · multipart/form-data</p>
            <div className="bg-[#020817] border border-slate-800 rounded-xl p-4 text-xs font-mono text-slate-400">
              <span className="text-indigo-300">file</span>: Audio file (.wav / .mp3 / .flac)
            </div>
          </div>
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-widest mb-2">Formats Supported</p>
            <div className="bg-[#020817] border border-slate-800 rounded-xl p-4 text-xs font-mono text-slate-400 space-y-1">
              <div className="text-green-400">✓ WAV, FLAC, OGG (soundfile)</div>
              <div className="text-green-400">✓ MP3, M4A, AAC (pydub+ffmpeg)</div>
              <div className="text-slate-600">Auto-resampled → 16 kHz mono</div>
            </div>
          </div>
        </div>
        <Code lang="json">{`{
  "results": [
    {
      "second": 1,
      "spoof_prob": 0.05,
      "verdict": {
        "risk": "REAL",          // "REAL" | "MEDIUM RISK" | "HIGH RISK"
        "score": 0.05,           // weighted rolling avg, 0.0–1.0
        "color": "green",
        "window_count": 1,
        "per_window_scores": [0.05],
        "early_flag": false      // true if 3 consecutive windows > 0.80
      }
    }
  ],
  "final_verdict": { "risk": "HIGH RISK", "score": 0.89 },
  "total_seconds": 12
}`}</Code>
      </Section>

      <Section icon={<Radio className="w-5 h-5"/>} title="WebSocket API — /stream" color="#f59e0b">
        <p className="text-slate-400 text-sm mb-4">Real-time streaming endpoint. Send 1-second float32 chunks, receive live verdicts. <strong className="text-white">Runs indefinitely</strong> until client disconnects.</p>
        <div className="bg-[#020817] border border-slate-800 rounded-xl px-4 py-3 font-mono text-sm mb-4">
          <Badge color="#f59e0b">WS</Badge><span className="text-white">ws://&lt;backend&gt;/stream</span>
        </div>
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-widest mb-2">Client → Server</p>
            <div className="bg-[#020817] border border-slate-800 rounded-xl p-4 text-xs font-mono text-slate-400 space-y-1">
              <div>Type: <span className="text-amber-300">Binary (ArrayBuffer)</span></div>
              <div>Format: Float32Array</div>
              <div>Length: <span className="text-amber-300">16000 samples</span> (= 1s @ 16kHz)</div>
              <div>Range: <span className="text-amber-300">[-1.0, 1.0]</span> normalised</div>
            </div>
          </div>
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-widest mb-2">Server → Client (each window)</p>
            <Code lang="json">{`{
  "risk": "MEDIUM RISK",
  "score": 0.65,
  "color": "orange",
  "window_count": 4,
  "per_window_scores": [0.1,0.3,0.7,0.9],
  "early_flag": true
}`}</Code>
          </div>
        </div>
        <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4 text-xs text-amber-300 font-mono">
          <AlertTriangle className="w-3.5 h-3.5 inline mr-1.5"/>Browser AudioContext runs at native rate (44100/48000 Hz). Frontend downsample() converts to 16000 Hz before sending.
        </div>
      </Section>

      <Section icon={<Package className="w-5 h-5"/>} title="Environment Setup" color="#a78bfa">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-widest mb-2">frontend/.env</p>
            <Code lang="env">{`VITE_BACKEND_URL=http://localhost:8000
VITE_WS_URL=ws://localhost:8000

# Production (HuggingFace):
# VITE_BACKEND_URL=https://user-space.hf.space
# VITE_WS_URL=wss://user-space.hf.space`}</Code>
          </div>
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-widest mb-2">Run locally</p>
            <Code lang="bash">{`# Terminal 1 — Backend
cd backend
source venv/bin/activate
uvicorn main:app --reload --port 8000

# Terminal 2 — Frontend  
cd frontend
npm run dev
# → http://localhost:5173`}</Code>
          </div>
        </div>
      </Section>
    </motion.div>
  );
}
