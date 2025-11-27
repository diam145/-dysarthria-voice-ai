import React, { useEffect, useRef } from "react";

interface Props {
  isRecording: boolean;
  theme?: "dark" | "colorful";
}

const AudioVisualizer: React.FC<Props> = ({ isRecording, theme = "dark" }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Cleanup function
  const cleanup = () => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    if (analyserRef.current) {
      analyserRef.current.disconnect();
      analyserRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    
    // Clear canvas
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  };

  useEffect(() => {
    if (!isRecording) {
      cleanup();
      return;
    }

    const initAudio = async () => {
      try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        audioContextRef.current = new AudioCtx();
        
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;
        
        const audioCtx = audioContextRef.current!;
        sourceRef.current = audioCtx.createMediaStreamSource(stream);
        
        const analyser = audioCtx.createAnalyser();
        // Larger FFT size for smoother data points
        analyser.fftSize = 512; 
        // Higher smoothing for that "liquid" feel
        analyser.smoothingTimeConstant = 0.85; 
        analyserRef.current = analyser;

        sourceRef.current.connect(analyser);

        draw();
      } catch (err) {
        console.error("Error initializing audio visualizer:", err);
      }
    };

    initAudio();

    return cleanup;
  }, [isRecording, theme]);

  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas || !analyserRef.current) return;

    const ctx = canvas.getContext("2d")!;
    const analyser = analyserRef.current;
    const bufferLength = analyser.frequencyBinCount;
    const data = new Uint8Array(bufferLength);

    // Handle High DPI Screens for crisp lines
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    
    // Set actual size in memory (scaled to account for extra pixel density)
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    
    // Normalize coordinate system to use css pixels
    ctx.scale(dpr, dpr);

    const WIDTH = rect.width;
    const HEIGHT = rect.height;
    const midY = HEIGHT / 2;

    // Configuration based on theme
    const isColorful = theme === "colorful";
    const primaryColor = isColorful ? "#a855f7" : "#3b82f6"; // Purple or Blue
    const secondaryColor = isColorful ? "#ec4899" : "#06b6d4"; // Pink or Cyan

    const render = () => {
      analyser.getByteFrequencyData(data);

      ctx.clearRect(0, 0, WIDTH, HEIGHT);
      
      // Create Gradients
      const gradient = ctx.createLinearGradient(0, 0, WIDTH, 0);
      gradient.addColorStop(0, primaryColor);
      gradient.addColorStop(0.5, secondaryColor);
      gradient.addColorStop(1, primaryColor);

      // Draw Settings
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      // --- DRAW WAVE FUNCTION ---
      const drawWave = (dataArray: Uint8Array, dampener: number, color: string, thickness: number, offset: number) => {
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = thickness;
        
        // Start at the left middle
        ctx.moveTo(0, midY);

        // We only visualize the first 30% of the frequency bins (where human voice lives)
        // otherwise the right side of the graph is usually flat.
        const sliceWidth = WIDTH / (bufferLength * 0.4); 
        
        let x = 0;

        // Loop through data to create control points for curves
        for (let i = 0; i < bufferLength * 0.4; i++) {
          const v = dataArray[i] / 128.0; // value 0 to 2 approx
          const amplitude = (v - 1) * (HEIGHT / 2) * dampener; // Scale height
          
          const y = midY - amplitude;
          
          // Use offset to create a "moving" effect if desired, or just static symmetric
          // For Smooth Curves: use quadraticCurveTo
          // We calculate the midpoint between this point and the next to use as the anchor
          
          const nextV = dataArray[i + 1] ? dataArray[i + 1] / 128.0 : 1;
          const nextAmp = (nextV - 1) * (HEIGHT / 2) * dampener;
          const nextY = midY - nextAmp;
          const nextX = x + sliceWidth;

          const cpX = (x + nextX) / 2;
          const cpY = (y + nextY) / 2;

          ctx.quadraticCurveTo(x, y, cpX, cpY);

          x += sliceWidth;
        }

        ctx.lineTo(WIDTH, midY);
        ctx.stroke();
        ctx.closePath();
      };

      // 1. Draw Background Glow Wave (Lower opacity, wider line)
      ctx.globalAlpha = 0.3;
      ctx.shadowBlur = 20;
      ctx.shadowColor = secondaryColor;
      drawWave(data, 0.6, secondaryColor, 6, 5);

      // 2. Draw Main Wave (High opacity, sharp line)
      ctx.globalAlpha = 1.0;
      ctx.shadowBlur = isColorful ? 15 : 10;
      ctx.shadowColor = primaryColor;
      // Slightly amplify the main wave (0.8)
      drawWave(data, 0.9, gradient as any, 3, 0);

      // 3. Draw Mirror Wave (Bottom half reflection effect)
      ctx.globalAlpha = 0.15;
      ctx.save();
      ctx.translate(0, HEIGHT); // Move to bottom
      ctx.scale(1, -1); // Flip vertically
      drawWave(data, 0.5, primaryColor, 4, 0);
      ctx.restore();

      rafRef.current = requestAnimationFrame(render);
    };

    render();
  };

  return (
    <div className="relative w-full h-[100px] rounded-xl overflow-hidden bg-black/20 backdrop-blur-sm border border-white/5">
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        style={{ width: "100%", height: "100%" }}
      />
      {/* Optional Overlay for extra polish */}
      <div className="absolute inset-0 pointer-events-none bg-gradient-to-r from-black/20 via-transparent to-black/20" />
    </div>
  );
};

export default AudioVisualizer;