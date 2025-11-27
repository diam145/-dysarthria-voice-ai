import React, { useEffect, useRef } from "react";

interface Props {
  isRecording: boolean;
}

const AudioVisualizer: React.FC<Props> = ({ isRecording }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const noiseFloorRef = useRef<number>(0); // Auto-learned baseline noise

  useEffect(() => {
    if (!isRecording) return;

    navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
      audioContextRef.current = new AudioContext();
      const source = audioContextRef.current.createMediaStreamSource(stream);

      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 512;

      source.connect(analyserRef.current);

      // 🔥 Learn the noise floor for 1 second
      learnNoiseFloor();

      drawBars();
    });

    return () => {
      audioContextRef.current?.close();
    };
  }, [isRecording]);

  /**
   * 🔥 Automatically learn background noise level
   */
  const learnNoiseFloor = () => {
    const analyser = analyserRef.current;
    if (!analyser) return;

    let samples: number[] = [];

    const learn = () => {
      const arr = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(arr);

      const rms = Math.sqrt(arr.reduce((a, b) => a + b * b, 0) / arr.length);
      samples.push(rms);

      if (samples.length < 30) {
        requestAnimationFrame(learn);
      } else {
        // Baseline = average * 1.3
        const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
        noiseFloorRef.current = avg * 1.3;
        console.log("🎤 Noise floor learned:", noiseFloorRef.current);
      }
    };

    learn();
  };

  /**
   * 🔥 Draw smooth noise-gated bar waveform
   */
  const drawBars = () => {
    if (!canvasRef.current || !analyserRef.current) return;

    const ctx = canvasRef.current.getContext("2d")!;
    const analyser = analyserRef.current!;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      requestAnimationFrame(draw);

      analyser.getByteFrequencyData(dataArray);

      // Compute RMS volume
      const rms = Math.sqrt(dataArray.reduce((a, b) => a + b * b, 0) / dataArray.length);

      // 🔥 Apply noise gate
      const noiseGate = noiseFloorRef.current || 15;
      const signal = Math.max(0, rms - noiseGate);

      ctx.clearRect(0, 0, canvasRef.current!.width, canvasRef.current!.height);

      if (signal <= 1) {
        // Silent → draw flat bar
        ctx.fillStyle = "rgba(129, 140, 248, 0.3)";
        ctx.fillRect(0, canvasRef.current!.height / 2 - 2, canvasRef.current!.width, 4);
        return;
      }

      // Draw animated bars
      const barWidth = (canvasRef.current!.width / bufferLength) * 1.5;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        let barHeight = (dataArray[i] - noiseGate) * 0.8;
        if (barHeight < 0) barHeight = 0;

        ctx.fillStyle = "rgb(129, 140, 248)"; // Indigo
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
