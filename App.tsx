import React, { useState, useEffect, useCallback, useRef } from 'react';
import { WhisperService } from './services/whisper';
import { SignalingService } from './services/signaling';
import { TranscriptEntry, ConnectionStatus, SignalingMessage, Guest, Theme } from './types';
import AudioVisualizer from './components/AudioVisualizer';
import TranscriptView from './components/TranscriptView';
import QRCode from 'react-qr-code';
import { Mic, Share2, X, Check, Copy, AlertCircle, Play, Square, Users, Sparkles, User, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// --- CONFIGURATION ---
// Paste your Hugging Face Endpoint URL here
const CONFIG_ENDPOINT_URL = "https://toduppco1u158vdg.us-east-1.aws.endpoints.huggingface.cloud"; 
// Optional: Paste your HF Token here if using a Private/Protected endpoint
const CONFIG_HF_TOKEN = import.meta.env.VITE_HF_TOKEN;
const token = CONFIG_HF_TOKEN; // environment handles fallback automatically


const App: React.FC = () => {
  // Routing State
  const [view, setView] = useState<'landing' | 'host' | 'guest'>('landing');
  const [sessionId, setSessionId] = useState<string>('');
  
  // Customization State
  const [theme, setTheme] = useState<Theme>('dark');
  
  // App State
  const [isRecording, setIsRecording] = useState(false);
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  
  // Sharing State
  const [showShareModal, setShowShareModal] = useState(false);
  const [guests, setGuests] = useState<Guest[]>([]);
  const [pendingGuest, setPendingGuest] = useState<Guest | null>(null);
  const [guestConnectionStatus, setGuestConnectionStatus] = useState<'idle' | 'requesting' | 'connected' | 'rejected'>('idle');

  // Services
  const whisperRef = useRef<WhisperService | null>(null);
  const signalingRef = useRef<SignalingService | null>(null);

  // Initialize Session ID and View
  useEffect(() => {
    const hash = window.location.hash;
    if (hash.startsWith('#/guest/')) {
      const sid = hash.replace('#/guest/', '');
      setSessionId(sid);
      setView('guest');
    }
  }, []);

  // Initialize Signaling
  useEffect(() => {
    if (!sessionId) return;

    const signaling = new SignalingService(sessionId);
    signalingRef.current = signaling;

    // Determine role based on current view
    const role = view === 'host' ? 'host' : 'guest';

    signaling.connect(role, (msg: SignalingMessage) => {
      if (view === 'host') {
        handleHostMessage(msg);
      } else if (view === 'guest') {
        handleGuestMessage(msg);
      }
    });

    return () => signaling.close();
  }, [sessionId, view]);

  // Host Message Handling
  const handleHostMessage = (msg: SignalingMessage) => {
    switch (msg.type) {
      case 'JOIN_REQUEST':
        setPendingGuest({ id: msg.senderId!, name: 'Guest ' + msg.senderId?.substring(0, 4), status: 'pending' });
        break;
    }
  };

  // Guest Message Handling
  const handleGuestMessage = (msg: SignalingMessage) => {
    const myGuestId = getGuestId();
    switch (msg.type) {
      case 'JOIN_APPROVED':
        console.log("Guest received JOIN_APPROVED:", msg);

      // No more strict guest ID matching — allow joining
      setGuestConnectionStatus('connected');

      break;
      case 'JOIN_REJECTED':
        setGuestConnectionStatus('rejected');
        break;
      case 'TRANSCRIPT_UPDATE':
        if (guestConnectionStatus === "connected") {
          const entry = msg.payload.entry as TranscriptEntry;

          // Append transcript to guest side
          setTranscript((prev) => [...prev, entry]);
        }
        break;
      case 'TRANSCRIPT_CLEAR':
         if (guestConnectionStatus === 'connected') {
            setTranscript([]);
         }
         break;
      case 'SESSION_ENDED':
        setGuestConnectionStatus('idle');
        setTranscript([]);
        break;
    }
  };

  const getGuestId = () => {
    let gid = localStorage.getItem('guest_id');
    if (!gid) {
      gid = Math.random().toString(36).substring(7);
      localStorage.setItem('guest_id', gid);
    }
    return gid;
  };

  // Host Actions
  const startHostSession = () => {
    // Generate a short random ID
    const sid = Math.random().toString(36).substring(2, 8);
    setSessionId(sid);
    if (window.location.hash) window.location.hash = ''; 
    setView('host');
  };

  const clearTranscript = () => {
    setTranscript([]);
    signalingRef.current?.send({
        type: 'TRANSCRIPT_CLEAR'
    });
  };

  const toggleRecording = useCallback(async () => {
    if (isRecording) {
      await whisperRef.current?.disconnect();
      setIsRecording(false);
      setStatus('disconnected');
    } else {
      // Check hardcoded config
      const endpoint = CONFIG_ENDPOINT_URL || process.env.HF_ENDPOINT_URL;
      const token = CONFIG_HF_TOKEN || process.env.HF_TOKEN;

      if (!endpoint) {
        setError("Missing Endpoint URL. Please add CONFIG_ENDPOINT_URL in App.tsx.");
        return;
      }
      
      setStatus('connecting');
      setError(null);
      
      const service = new WhisperService({
        endpointUrl: endpoint,
        hfToken: token,

        // Called when audio stream starts (not HF ready yet)
        onConnect: () => {
          setStatus('connecting');
          setIsRecording(true);
        },

        // HuggingFace says "model is loading..."
        onWarmup: () => {
          setStatus('warming_up');
        },

        // First real transcription received
        onReady: () => {
          setStatus('connected');
        },

        // Local transcript update on host
        onTranscription: (entry) => {
          setTranscript((prev) => [...prev, entry]);

          // Broadcast to guests
          signalingRef.current?.send({
            type: 'TRANSCRIPT_UPDATE',
            payload: { entry }
          });
        },

        // Send transcript to Firebase directly from WhisperService (fire-and-forget)
        onBroadcastTranscript: (entry) => {
          signalingRef.current?.send({
            type: 'TRANSCRIPT_UPDATE',
            payload: { entry }
          });
        },

        onDisconnect: () => {
          setStatus('disconnected');
          setIsRecording(false);
        },

        onError: (err) => {
          console.error("WhisperService error:", err);
          setError(err.message || "Connection failed");
          setStatus('error');
          setIsRecording(false);
        }
      });

      
      whisperRef.current = service;
      await service.connect();
    }
  }, [isRecording]);

  const handleGuestResponse = (accept: boolean) => {
    if (!pendingGuest) return;
    if (accept) {
      setGuests([...guests, { ...pendingGuest, status: 'connected' }]);
      signalingRef.current?.send({
        type: 'JOIN_APPROVED',
        payload: { guestId: pendingGuest.id }
      });
    } else {
      signalingRef.current?.send({
        type: 'JOIN_REJECTED',
        payload: { guestId: pendingGuest.id }
      });
    }
    setPendingGuest(null);
  };

  const requestJoin = () => {
    setGuestConnectionStatus('requesting');
    const myId = getGuestId();
    // Signaling might take a moment to open connection
    setTimeout(() => {
        signalingRef.current?.send({
            type: 'JOIN_REQUEST',
            senderId: myId,
            payload: { name: 'Guest' }
        });
    }, 1500);
  };

  const copyLink = () => {
    const url = window.location.origin + window.location.pathname + '#/guest/' + sessionId;
    navigator.clipboard.writeText(url);
  };

  // Theme Classes Helper
  const getThemeClasses = () => {
    if (theme === 'colorful') {
      return {
        bg: "bg-gradient-to-br from-indigo-950 via-purple-950 to-pink-950",
        text: "text-white",
        card: "bg-white/10 border-white/20 backdrop-blur-md",
        buttonPrimary: "bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-400 hover:to-purple-400 shadow-lg shadow-purple-900/30",
        buttonSecondary: "bg-white/10 hover:bg-white/20 text-white",
        header: "bg-white/5 border-white/10 backdrop-blur-md",
      };
    }
    return {
      bg: "bg-black",
      text: "text-zinc-100",
      card: "bg-zinc-950 border-zinc-800",
      buttonPrimary: "bg-indigo-600 hover:bg-indigo-500",
      buttonSecondary: "bg-zinc-800 hover:bg-zinc-700 text-zinc-200",
      header: "bg-zinc-950/50 border-zinc-800 backdrop-blur",
    };
  };

  const tc = getThemeClasses();

  // --- RENDER ---

  // 1. Landing View
  if (view === 'landing') {
    return (
      <div className={`min-h-screen ${tc.bg} ${tc.text} flex flex-col items-center justify-center p-6 relative overflow-hidden transition-colors duration-500`}>
        
        {/* Theme Toggle in Corner */}
        <div className="absolute top-6 right-6">
           <button 
             onClick={() => setTheme(prev => prev === 'dark' ? 'colorful' : 'dark')}
             className={`flex items-center gap-2 px-4 py-2 rounded-full ${tc.buttonSecondary} transition-all`}
           >
             <Sparkles className="w-4 h-4" />
             <span className="text-sm font-medium capitalize">{theme} Mode</span>
           </button>
        </div>

        <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-12 relative z-10"
        >
             <div className="w-16 h-16 bg-gradient-to-tr from-indigo-500 to-purple-500 rounded-2xl mx-auto mb-6 flex items-center justify-center shadow-2xl">
                <Mic className="w-8 h-8 text-white" />
             </div>
             <h1 className="text-4xl md:text-5xl font-bold mb-4 tracking-tight">Dysarthria Speech</h1>
             <p className="text-base opacity-60 max-w-lg mx-auto">Live AI-driven transcription helping people with Dysarthria communicate clearly.</p>
        </motion.div>

        <div className="grid md:grid-cols-2 gap-6 w-full max-w-2xl relative z-10">
            {/* Speaker Card */}
            <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={startHostSession}
                className={`p-8 rounded-3xl border text-left group transition-all duration-300 ${tc.card} hover:border-indigo-500/50 hover:shadow-2xl hover:shadow-indigo-900/20`}
            >
                <div className="w-12 h-12 rounded-2xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center mb-6 group-hover:bg-indigo-500 group-hover:text-white transition-colors">
                    <Mic className="w-6 h-6" />
                </div>
                <h2 className="text-2xl font-semibold mb-2">I'm the Speaker</h2>
                <p className="opacity-60">Start a new session, record audio, and share the live transcript with others.</p>
            </motion.button>

            {/* Guest Card */}
            <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setView('guest')}
                className={`p-8 rounded-3xl border text-left group transition-all duration-300 ${tc.card} hover:border-purple-500/50 hover:shadow-2xl hover:shadow-purple-900/20`}
            >
                <div className="w-12 h-12 rounded-2xl bg-purple-500/20 text-purple-400 flex items-center justify-center mb-6 group-hover:bg-purple-500 group-hover:text-white transition-colors">
                    <User className="w-6 h-6" />
                </div>
                <h2 className="text-2xl font-semibold mb-2">I'm a Guest</h2>
                <p className="opacity-60">Join an existing session via code or link to view the live transcript.</p>
            </motion.button>
        </div>
      </div>
    );
  }
  
  // 2. Guest View
  if (view === 'guest') {
    return (
      <div className={`min-h-screen ${tc.bg} ${tc.text} flex flex-col items-center justify-center p-6 transition-colors duration-500`}>
         <div className="absolute top-6 left-6">
           <button 
             onClick={() => setView('landing')}
             className={`flex items-center gap-2 px-4 py-2 rounded-full ${tc.buttonSecondary} text-sm`}
           >
             Back
           </button>
        </div>

        <div className="w-full max-w-md space-y-8 relative z-10">
            <div className="text-center">
                <h1 className="text-2xl font-bold mb-2">Dysarthria Speech</h1>
                <p className="opacity-60">Guest Access</p>
            </div>

            {/* Manual Session ID Input if empty */}
            {!sessionId && (
                 <div className={`${tc.card} border rounded-2xl p-6 text-center space-y-4`}>
                    <p className="opacity-80">Enter the Session ID provided by the host.</p>
                     <input 
                        type="text" 
                        placeholder="e.g. x7y8z9"
                        className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-center outline-none focus:border-indigo-500 transition-colors"
                        onKeyDown={(e) => {
                            if(e.key === 'Enter') {
                                setSessionId(e.currentTarget.value);
                            }
                        }}
                     />
                 </div>
            )}

            {sessionId && guestConnectionStatus === 'idle' && (
                <div className={`${tc.card} border rounded-2xl p-6 text-center space-y-6`}>
                    <p className="opacity-80">You are invited to session <span className="font-mono bg-white/10 px-1 rounded">{sessionId}</span></p>
                    <button 
                        onClick={requestJoin}
                        className={`w-full ${tc.buttonPrimary} text-white font-semibold py-3 px-6 rounded-xl transition-all flex items-center justify-center gap-2`}
                    >
                        Join Session
                    </button>
                </div>
            )}

            {guestConnectionStatus === 'requesting' && (
                <div className={`${tc.card} border rounded-2xl p-8 text-center space-y-4`}>
                    <div className="animate-spin w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full mx-auto"/>
                    <p className="opacity-60">Waiting for host approval...</p>
                </div>
            )}

            {guestConnectionStatus === 'rejected' && (
                <div className="bg-red-900/20 border border-red-900/50 rounded-2xl p-6 text-center text-red-300">
                    <p>Access request was denied by the host.</p>
                    <button onClick={() => setGuestConnectionStatus('idle')} className="mt-4 text-sm underline opacity-60 hover:opacity-100">Try Again</button>
                </div>
            )}
            
            {guestConnectionStatus === 'connected' && (
                 <div className={`${tc.card} border rounded-2xl h-[70vh] flex flex-col overflow-hidden shadow-2xl`}>
                    <div className="p-4 border-b border-white/5 bg-black/20 backdrop-blur flex justify-between items-center">
                         <span className="flex items-center gap-2 text-xs font-mono text-green-400">
                            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"/>
                            LIVE
                         </span>
                         <span className="text-xs opacity-50">Session: {sessionId}</span>
                    </div>
                    <TranscriptView transcript={transcript} />
                </div>
            )}
        </div>
      </div>
    );
  }

  // 3. Host View
  return (
    <div className={`min-h-screen ${tc.bg} ${tc.text} flex flex-col transition-colors duration-500`}>
      {/* Header */}
      <header className={`h-16 border-b flex items-center justify-between px-6 sticky top-0 z-10 ${tc.header}`}>
        <div className="flex items-center gap-2 cursor-pointer" onClick={() => setView('landing')}>
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${theme === 'colorful' ? 'bg-gradient-to-tr from-indigo-500 to-purple-500' : 'bg-indigo-600'}`}>
                <Mic className="w-5 h-5 text-white" />
            </div>
            <span className="font-semibold text-lg tracking-tight hidden sm:block">Dysarthria Speech</span>
        </div>
        
        <div className="flex items-center gap-3">
            {/* Clear Button */}
            <button 
                onClick={clearTranscript}
                title="Clear Transcript"
                className={`p-2 rounded-lg transition-colors ${theme === 'colorful' ? 'hover:bg-white/10 text-white/70 hover:text-white' : 'hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200'}`}
            >
                <Trash2 className="w-4 h-4" />
            </button>

            <div className={`hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full border ${theme === 'colorful' ? 'border-white/10 bg-white/5' : 'border-zinc-800 bg-zinc-900'}`}>
                <Users className="w-4 h-4 opacity-50" />
                <span className="text-xs opacity-60">{guests.length} Guest{guests.length !== 1 ? 's' : ''}</span>
            </div>
            <button 
                onClick={() => setShowShareModal(true)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tc.buttonSecondary}`}
            >
                <Share2 className="w-4 h-4" />
                Share
            </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col max-w-4xl mx-auto w-full p-4 gap-4 relative z-0">
        
        {error && (
            <div className="p-4 bg-red-900/20 border border-red-900/50 rounded-xl text-red-200 text-sm flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                {error}
            </div>
        )}

        {/* Visualizer & Status */}
        <div className={`${tc.card} border rounded-2xl p-6 shadow-xl flex flex-col gap-4`}>
            <div className="flex justify-between items-center mb-2">
                <div className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${status === 'connected' ? 'bg-green-500 animate-pulse' : 'bg-zinc-600'}`} />
                    <span className="text-xs uppercase tracking-wider opacity-60 font-semibold">{status}</span>
                </div>
            </div>
            <AudioVisualizer isRecording={isRecording} />
        </div>

        {/* Transcript Area */}
        <div className={`flex-1 ${tc.card} border rounded-2xl shadow-xl overflow-hidden flex flex-col`}>
             <TranscriptView transcript={transcript} />
        </div>
      </main>

      {/* Footer Controls */}
      <footer className="p-6 flex justify-center sticky bottom-0 pointer-events-none z-20">
        <button
            onClick={toggleRecording}
            disabled={status === 'connecting'}
            className={`pointer-events-auto shadow-2xl scale-100 hover:scale-105 active:scale-95 transition-all duration-200 w-16 h-16 rounded-full flex items-center justify-center ${
                isRecording 
                ? 'bg-red-500 hover:bg-red-600 shadow-red-900/20' 
                : `${tc.buttonPrimary}`
            } text-white`}
        >
            {status === 'connecting' ? (
                 <div className="animate-spin w-6 h-6 border-2 border-white/30 border-t-white rounded-full" />
            ) : isRecording ? (
                <Square className="w-6 h-6 fill-current" />
            ) : (
                <Play className="w-6 h-6 ml-1 fill-current" />
            )}
        </button>
      </footer>

      {/* Pending Guest Toast */}
      <AnimatePresence>
        {pendingGuest && (
            <motion.div 
                initial={{ opacity: 0, y: 50, x: '-50%' }}
                animate={{ opacity: 1, y: 0, x: '-50%' }}
                exit={{ opacity: 0, y: 50, x: '-50%' }}
                className={`fixed bottom-24 left-1/2 ${tc.card} border px-6 py-4 rounded-xl shadow-2xl flex items-center gap-6 z-50 w-[90%] max-w-sm backdrop-blur-xl`}
            >
                <div>
                    <p className="font-semibold text-sm">Join Request</p>
                    <p className="text-xs opacity-60">{pendingGuest.name} wants to view transcript.</p>
                </div>
                <div className="flex gap-2">
                    <button 
                        onClick={() => handleGuestResponse(false)}
                        className="p-2 hover:bg-white/10 rounded-lg opacity-60 hover:text-red-400 transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                    <button 
                        onClick={() => handleGuestResponse(true)}
                        className={`p-2 rounded-lg text-white shadow-lg transition-colors ${tc.buttonPrimary}`}
                    >
                        <Check className="w-5 h-5" />
                    </button>
                </div>
            </motion.div>
        )}
      </AnimatePresence>

      {/* Share Modal */}
      <AnimatePresence>
        {showShareModal && (
            <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                <motion.div 
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className={`${tc.card} border rounded-2xl p-6 w-full max-w-sm relative`}
                >
                    <button 
                        onClick={() => setShowShareModal(false)}
                        className="absolute top-4 right-4 opacity-50 hover:opacity-100"
                    >
                        <X className="w-5 h-5" />
                    </button>
                    
                    <h2 className="text-xl font-bold mb-1">Share Session</h2>
                    <p className="text-sm opacity-60 mb-6">Scan to join this live session</p>
                    
                    <div className="bg-white p-4 rounded-xl mb-6 mx-auto w-fit">
                        <QRCode 
                            value={window.location.origin + window.location.pathname + '#/guest/' + sessionId} 
                            size={180}
                        />
                    </div>
                    
                    <button 
                        onClick={copyLink}
                        className={`w-full py-3 rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2 ${tc.buttonSecondary}`}
                    >
                        <Copy className="w-4 h-4" />
                        Copy Invite Link
                    </button>
                </motion.div>
            </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default App;