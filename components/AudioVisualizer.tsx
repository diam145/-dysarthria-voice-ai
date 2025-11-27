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
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
      }
      return;
    }

    // Setup audio
    audioContextRef.current = new AudioContext();
    navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
      const audioCtx = audioContextRef.current!;
      sourceRef.current = audioCtx.createMediaStreamSource(stream);

      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.7;
      analyserRef.current = analyser;

      sourceRef.current.connect(analyser);

      drawBars();
    });

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isRecording]);

  const drawBars = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d")!;
    const analyser = analyserRef.current!;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const BAR_COUNT = 60;
    const BAR_WIDTH = canvas.width / BAR_COUNT;

    const gradient = ctx.createLinearGradient(0, 0, canvas.width, 0);
    if (theme === "colorful") {
      gradient.addColorStop(0, "#4f46e5");
      gradient.addColorStop(0.5, "#9333ea");
      gradient.addColorStop(1, "#ec4899");
    } else {
      gradient.addColorStop(0, "#6366f1");
      gradient.addColorStop(1, "#3b82f6");
    }

    const render = () => {
      analyser.getByteFrequencyData(dataArray);

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const mid = canvas.height / 2;

      for (let i = 0; i < BAR_COUNT; i++) {
        const slice = Math.floor((i / BAR_COUNT) * bufferLength);
        const value = dataArray[slice];

        const normalized = value / 255; // 0–1
        const barHeight = normalized * (canvas.height * 0.8);

        ctx.fillStyle = gradient;
        ctx.fillRect(
          i * BAR_WIDTH,
          mid - barHeight / 2,
          BAR_WIDTH * 0.8,
          barHeight
        );
      }

      rafRef.current = requestAnimationFrame(render);
    };

    render();
  };

  return (
    <canvas
      ref={canvasRef}
      width={600}
      height={100}
      className="w-full h-[60px] rounded-xl opacity-90"
    />
  );
};

export default AudioVisualizer;
