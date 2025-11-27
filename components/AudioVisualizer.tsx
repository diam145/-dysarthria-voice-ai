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

  // Configuration constants
  const FFT_SIZE = 2048; // High resolution for smooth time-domain waves
  const NOISE_FLOOR = 3; // Ignore signals below this deviation (0-128 scale) to stay steady
  const AMPLIFICATION = 1.5; // Boost visual height of the wave

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
    
    // Clear and reset canvas to a flat line
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      if (ctx) {
          const { width, height } = canvas;
          ctx.clearRect(0, 0, width, height);
          ctx.beginPath();
          ctx.moveTo(0, height / 2);
          ctx.lineTo(width, height / 2);
          ctx.strokeStyle = theme === "colorful" ? "rgba(168, 85, 247, 0.2)" : "rgba(59, 130, 246, 0.2)";
          ctx.lineWidth = 2;
          ctx.stroke();
      }
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
        analyser.fftSize = FFT_SIZE;
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
    const bufferLength = analyser.fftSize;
    const dataArray = new Uint8Array(bufferLength);

    // Handle High DPI Screens
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const WIDTH = rect.width;
    const HEIGHT = rect.height;
    const midY = HEIGHT / 2;

    const isColorful = theme === "colorful";
    const primaryColor = isColorful ? "#a855f7" : "#3b82f6"; // Purple or Blue
    const secondaryColor = isColorful ? "#ec4899" : "#06b6d4"; // Pink or Cyan

    const render = () => {
      // Get Time Domain Data (Waveform) - this sits at 128 for silence
      analyser.getByteTimeDomainData(dataArray);

      ctx.clearRect(0, 0, WIDTH, HEIGHT);

      // Create Gradients
      const gradient = ctx.createLinearGradient(0, 0, WIDTH, 0);
      gradient.addColorStop(0, primaryColor);
      gradient.addColorStop(0.5, secondaryColor);
      gradient.addColorStop(1, primaryColor);

      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      const drawWave = (offsetY: number, color: string | CanvasGradient, width: number, phaseShift: number) => {
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = width;

        const sliceWidth = WIDTH / bufferLength;
        let x = 0;

        // We use a subset of the buffer to zoom in on the waveform
        // otherwise it looks too high frequency/jittery
        const zoomFactor = 4; 
        const effectiveBuffer = Math.floor(bufferLength / zoomFactor);

        ctx.moveTo(0, midY);

        for (let i = 0; i < effectiveBuffer; i++) {
            // The data is a circular buffer in some browsers, but generally linear here.
            // Use phaseShift to grab different parts of the buffer for the "ghost" effect
            let index = (i * zoomFactor + phaseShift) % bufferLength;
            
            // 128 is zero (silence). 0 is -1, 255 is +1.
            let v = dataArray[index] / 128.0; 
            
            // Noise Gate & Smoothing
            let deviation = v - 1;
            
            // If signal is very weak (noise), force it to flat
            if (Math.abs(deviation) < (NOISE_FLOOR / 128)) {
                deviation = 0;
            }

            // Apply amplification
            let y = midY + (deviation * (HEIGHT / 2) * AMPLIFICATION) + offsetY;

            // Smooth curves
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                // Cubic spline or simple line. Linear is fast and with high FFT_SIZE looks smooth.
                // For extra smoothness, we could calculate control points, but at 2048 resolution
                // simple line segments are very smooth visually.
                // Let's use a simple averaging with previous point to smooth out jagged peaks
                const prevX = x - (WIDTH / effectiveBuffer);
                // const cpX = (prevX + x) / 2;
                // ctx.quadraticCurveTo(prevX, y, x, y); // naive
                ctx.lineTo(x, y);
            }

            x += (WIDTH / effectiveBuffer);
        }

        ctx.lineTo(WIDTH, midY);
        ctx.stroke();
    };

      // 1. Ghost Wave (faint, offset)
      ctx.globalAlpha = 0.3;
      ctx.shadowBlur = 0;
      drawWave(0, secondaryColor, 4, 100);

      // 2. Main Wave (bright, glowing)
      ctx.globalAlpha = 1.0;
      ctx.shadowBlur = 15;
      ctx.shadowColor = primaryColor;
      drawWave(0, gradient, 3, 0);

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
      {/* Vignette Overlay */}
      <div className="absolute inset-0 pointer-events-none bg-gradient-to-r from-black/40 via-transparent to-black/40" />
    </div>
  );
};

export default AudioVisualizer;