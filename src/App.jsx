import { Routes, Route, Link, useLocation } from 'react-router-dom';
import { Activity, BookOpen, ShieldAlert } from 'lucide-react';
import { Toaster } from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import Dashboard from './pages/Dashboard';
import Docs from './pages/Docs';

function App() {
  const location = useLocation();
  return (
    <div className="min-h-screen bg-[#020817] text-slate-100 flex flex-col" style={{ backgroundImage: 'linear-gradient(rgba(51,65,85,0.08) 1px,transparent 1px),linear-gradient(90deg,rgba(51,65,85,0.08) 1px,transparent 1px)', backgroundSize: '40px 40px' }}>
      <Toaster position="top-right" toastOptions={{ style: { background: '#0f172a', color: '#e2e8f0', border: '1px solid #1e293b', fontSize: '13px' } }} />
      <nav className="border-b border-slate-800/60 bg-[#020817]/90 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="relative">
                <ShieldAlert className="text-red-500 w-7 h-7" />
                <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-red-500" style={{ animation: 'pulse 1.5s ease-in-out infinite' }} />
              </div>
              <div>
                <span className="font-bold text-lg tracking-tight text-white">VoiceGuard</span>
                <span className="ml-2 text-[10px] text-slate-500 font-mono uppercase tracking-widest">AI</span>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Link to="/" className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${location.pathname === '/' ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'text-slate-400 hover:text-white hover:bg-slate-800/60'}`}>
                <Activity className="w-4 h-4" />Live Dashboard.
              </Link>
              <Link to="/docs" className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${location.pathname === '/docs' ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20' : 'text-slate-400 hover:text-white hover:bg-slate-800/60'}`}>
                <BookOpen className="w-4 h-4" />Docs
              </Link>
            </div>
          </div>
        </div>
      </nav>
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <AnimatePresence mode="wait">
          <Routes location={location} key={location.pathname}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/docs" element={<Docs />} />
          </Routes>
        </AnimatePresence>
      </main>
      <footer className="border-t border-slate-800/60 text-center py-4 text-slate-600 text-xs font-mono tracking-widest">
        VOICEGUARD AI • AASIST-L • HACKATHON 2026
      </footer>
    </div>
  );
}
export default App;
