import React, { useEffect, useRef } from "react";

interface Props {
  isRecording: boolean;
}

const AudioVisualizer: React.FC<Props> = ({ isRecording }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    if (!isRecording) return;

    navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
      audioContextRef.current = new AudioContext();
      const source = audioContextRef.current.createMediaStreamSource(stream);

      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;

      source.connect(analyserRef.current);

      drawBars();
    });

    return () => {
      audioContextRef.current?.close();
    };
  }, [isRecording]);

  const drawBars = () => {
    if (!canvasRef.current || !analyserRef.current) return;

    const ctx = canvasRef.current.getContext("2d")!;
    const bufferLength = analyserRef.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      requestAnimationFrame(draw);
      analyserRef.current!.getByteFrequencyData(dataArray);

      ctx.clearRect(0, 0, canvasRef.current!.width, canvasRef.current!.height);

      const barWidth = (canvasRef.current!.width / bufferLength) * 2;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const barHeight = dataArray[i] / 3;

        ctx.fillStyle = "rgba(129, 140, 248, 1)"; // Indigo
        ctx.fillRect(
          x,
          canvasRef.current!.height / 2 - barHeight / 2,
          barWidth,
          barHeight
        );

        x += barWidth + 1;
      }
    };

    draw();
  };

  return (
    <canvas
      ref={canvasRef}
      width={800}
      height={80}
      className="w-full rounded-xl"
    />
  );
};

export default AudioVisualizer;
