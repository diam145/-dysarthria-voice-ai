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

  useEffect(() => {
    if (!isRecording) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext("2d");
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
      return;
    }

    audioContextRef.current = new AudioContext();

    navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
      const audioCtx = audioContextRef.current!;
      sourceRef.current = audioCtx.createMediaStreamSource(stream);

      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.6;
      analyserRef.current = analyser;

      sourceRef.current.connect(analyser);

      draw();
    });

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isRecording]);

  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d")!;
    const analyser = analyserRef.current!;
    const bufferLength = analyser.frequencyBinCount;
    const data = new Uint8Array(bufferLength);

    const WIDTH = canvas.width;
    const HEIGHT = canvas.height;
    const BAR_COUNT = 90;
    const BAR_WIDTH = WIDTH / BAR_COUNT;

    const midY = HEIGHT / 2;

    // gradient
    const gradient = ctx.createLinearGradient(0, 0, WIDTH, 0);
    if (theme === "colorful") {
      gradient.addColorStop(0, "#4f46e5"); // indigo
      gradient.addColorStop(0.5, "#9333ea"); // violet
      gradient.addColorStop(1, "#ec4899"); // pink
    } else {
      gradient.addColorStop(0, "#3b82f6"); // blue
      gradient.addColorStop(1, "#06b6d4"); // cyan
    }

    const glowColor = theme === "colorful" ? "#a855f7" : "#3b82f6";

    const render = () => {
      analyser.getByteFrequencyData(data);

      ctx.clearRect(0, 0, WIDTH, HEIGHT);

      ctx.fillStyle = gradient;
      ctx.shadowColor = glowColor;
      ctx.shadowBlur = theme === "colorful" ? 18 : 10;

      for (let i = 0; i < BAR_COUNT; i++) {
        const slice = Math.floor((i / BAR_COUNT) * bufferLength);
        const amplitude = data[slice];

        // Normalize + scale
        const normalized = amplitude / 255;
        const barHeight = normalized * (HEIGHT * 0.9);

        const x = i * BAR_WIDTH;

        // draw top bar
        ctx.fillRect(x, midY - barHeight, BAR_WIDTH * 0.65, barHeight);

        // draw mirrored bottom bar
        ctx.fillRect(x, midY, BAR_WIDTH * 0.65, barHeight);
      }

      ctx.shadowBlur = 0;

      rafRef.current = requestAnimationFrame(render);
    };

    render();
  };

  return (
    <canvas
      ref={canvasRef}
      width={600}
      height={130}
      className="w-full h-[80px] rounded-xl"
    />
  );
};

export default AudioVisualizer;
