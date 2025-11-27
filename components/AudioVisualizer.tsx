import React, { useEffect, useRef } from 'react';

interface AudioVisualizerProps {
  isRecording: boolean;
}

const AudioVisualizer: React.FC<AudioVisualizerProps> = ({ isRecording }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Initialize with 0 to fix "Expected 1 arguments, but got 0" error
  const animationRef = useRef<number>(0);

  useEffect(() => {
    if (!isRecording) {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let time = 0;

    const animate = () => {
      time += 0.1;
      const width = canvas.width;
      const height = canvas.height;

      ctx.clearRect(0, 0, width, height);
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#4f46e5'; // Indigo 600

      ctx.beginPath();
      
      for (let x = 0; x < width; x++) {
        // Simple sine wave simulation for visualization since we don't have the raw analyzer node exposed here easily
        // In a full app, we'd pass the AnalyserNode prop.
        const y = height / 2 + Math.sin(x * 0.05 + time) * 10 * Math.sin(time * 0.5);
        if (x === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
      }
      
      ctx.stroke();
      animationRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [isRecording]);

  if (!isRecording) return <div className="h-12 w-full bg-zinc-900 rounded-lg flex items-center justify-center text-zinc-600 text-xs">Microphone Idle</div>;

  return (
    <div className="h-12 w-full bg-zinc-900 rounded-lg overflow-hidden relative">
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-indigo-400 text-xs font-mono animate-pulse">LISTENING</span>
        </div>
      <canvas ref={canvasRef} width={300} height={48} className="w-full h-full" />
    </div>
  );
};

export default AudioVisualizer;