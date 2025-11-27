import React, { useRef, useEffect } from 'react';

interface Props {
  isRecording: boolean;
}

const AudioVisualizer: React.FC<Props> = ({ isRecording }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);
  const animationRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isRecording) {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      return;
    }

    navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
      audioContextRef.current = new AudioContext();
      const source = audioContextRef.current.createMediaStreamSource(stream);

      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 2048;

      const bufferLength = analyserRef.current.frequencyBinCount;
      dataArrayRef.current = new Uint8Array(bufferLength);

      source.connect(analyserRef.current);

      draw();
    });

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [isRecording]);

  const draw = () => {
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
    const dataArray = dataArrayRef.current;

    if (!canvas || !analyser || !dataArray) return;

    const ctx = canvas.getContext("2d")!;
    const width = canvas.width;
    const height = canvas.height;

    analyser.getByteTimeDomainData(dataArray);

    ctx.clearRect(0, 0, width, height);
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#646cff";

    ctx.beginPath();
    const sliceWidth = width / dataArray.length;

    let x = 0;
    for (let i = 0; i < dataArray.length; i++) {
      let v = dataArray[i] / 128.0; 
      let y = (v * height) / 2;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      x += sliceWidth;
    }
    ctx.lineTo(width, height / 2);
    ctx.stroke();

    animationRef.current = requestAnimationFrame(draw);
  };

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-12 rounded-lg"
      width={800}
      height={50}
    />
  );
};

export default AudioVisualizer;
