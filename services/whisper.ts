import { WhisperConfig, TranscriptEntry } from '../types';

export class WhisperService {
  private inputAudioContext: AudioContext | null = null;
  private processor: ScriptProcessorNode | null = null;
  private mediaStream: MediaStream | null = null;
  private config: WhisperConfig;
  private isConnected = false;
  private hasSuccessfullyTranscribed = false;

  // Buffer for audio chunks
  private audioBuffer: Float32Array[] = [];
  private bufferLength = 0;
  private readonly TARGET_SAMPLE_RATE = 16000;
  private readonly CHUNK_DURATION_SEC = 3;
  private processingInterval: any = null;

  constructor(config: WhisperConfig) {
    this.config = config;
  }

  // --------------------
  // CONNECT MICROPHONE
  // --------------------
  async connect() {
    if (this.isConnected) return;

    try {
      this.inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });

      const source = this.inputAudioContext.createMediaStreamSource(this.mediaStream);
      this.processor = this.inputAudioContext.createScriptProcessor(4096, 1, 1);

      this.processor.onaudioprocess = (e) => {
        if (!this.isConnected) return;

        const inputData = e.inputBuffer.getChannelData(0);
        const currentSampleRate = this.inputAudioContext!.sampleRate;
        const processed = this.resampleToTarget(inputData, currentSampleRate);

        this.audioBuffer.push(processed);
        this.bufferLength += processed.length;
      };

      source.connect(this.processor);
      this.processor.connect(this.inputAudioContext.destination);

      this.isConnected = true;
      this.config.onConnect?.();  // microphone is ready

      // 🔥 IMPORTANT: warmup HF endpoint BEFORE any mic audio arrives
      const warmupSilence = new Float32Array(1600); // 0.1s
      const warmupWav = this.encodeToWAV(warmupSilence, this.TARGET_SAMPLE_RATE);

      this.sendToHuggingFace(warmupWav)
        .catch(() => this.config.onWarmup?.());

      // Start interval for live mic streaming
      this.processingInterval = setInterval(() => {
        this.processAudioChunk();
      }, this.CHUNK_DURATION_SEC * 1000);

    } catch (error) {
      this.config.onError(error as Error);
    }
  }



  // --------------------
  // RESAMPLING
  // --------------------
  private resampleToTarget(input: Float32Array, inputSampleRate: number): Float32Array {
    if (inputSampleRate === this.TARGET_SAMPLE_RATE) {
      return new Float32Array(input);
    }
    const ratio = inputSampleRate / this.TARGET_SAMPLE_RATE;
    const newLength = Math.ceil(input.length / ratio);
    const output = new Float32Array(newLength);

    for (let i = 0; i < newLength; i++) {
      const index = i * ratio;
      const p = Math.floor(index);
      const t = index - p;
      const s0 = input[p];
      const s1 = (p + 1 < input.length) ? input[p + 1] : s0;
      output[i] = s0 * (1 - t) + s1 * t;
    }
    return output;
  }

  // --------------------
  // SILENCE DETECTION
  // --------------------
  private isSilent(samples: Float32Array): boolean {
    let sum = 0;
    for (let i = 0; i < samples.length; i++) {
      sum += Math.abs(samples[i]);
    }
    const avg = sum / samples.length;

    // Threshold tuned for Whisper
    return avg < 0.008; 
  }

  // --------------------
  // PROCESS AUDIO CHUNK
  // --------------------
  private async processAudioChunk() {
    if (!this.isConnected || this.bufferLength === 0) return;

    const flatBuffer = new Float32Array(this.bufferLength);
    let offset = 0;
    for (const chunk of this.audioBuffer) {
      flatBuffer.set(chunk, offset);
      offset += chunk.length;
    }

    // reset buffer
    this.audioBuffer = [];
    this.bufferLength = 0;

    // === 🔇 SKIP SILENT AUDIO ===
    if (this.isSilent(flatBuffer)) {
      // console.log("Skipping silent chunk");
      return;
    }

    const wavBlob = this.encodeToWAV(flatBuffer, this.TARGET_SAMPLE_RATE);

    try {
      await this.sendToHuggingFace(wavBlob);
    } catch (err) {
      console.error("Transcription failed", err);

      if (err instanceof Error && err.message.includes("Authentication")) {
        this.config.onError(err);
        await this.disconnect();
      }
    }
  }

  // --------------------
  // SEND TO HUGGINGFACE
  // --------------------
  private async sendToHuggingFace(audioBlob: Blob) {
    const headers: Record<string, string> = {
      "Content-Type": "audio/wav",
    };
    if (this.config.hfToken) {
      headers["Authorization"] = `Bearer ${this.config.hfToken}`;
    }

    const response = await fetch(this.config.endpointUrl, {
      method: "POST",
      headers,
      body: audioBlob,
    });

    if (!response.ok) {
      const text = await response.text();
      let err = `HF API Error: ${response.status} ${response.statusText}`;

      try {
        const json = JSON.parse(text);
        if (json.error?.includes("loading")) {
          console.warn("🟡 MODEL IS WARMING UP");
          this.config.onWarmup?.();     // << Call UI warm-up state
          return;
        }
      } catch {}

      throw new Error(err);
    }

    const result = await response.json();

    let text = "";
    if (typeof result?.text === "string") text = result.text;
    if (Array.isArray(result) && typeof result[0]?.text === "string") text = result[0].text;

    if (text.trim().length > 0) {

      // FIRST SUCCESS → UI can show CONNECTED
      if (!this.hasSuccessfullyTranscribed) {
        this.hasSuccessfullyTranscribed = true;
        this.config.onReady?.(); // UI: "Connected"
      }

      const entry: TranscriptEntry = {
        id: Date.now().toString(),
        sender: "user",
        text: text.trim(),
        timestamp: Date.now(),
        isPartial: false,
      };

      // UI update
      this.config.onTranscription(entry);

      // BROADCAST TO GUESTS ✔️
      this.config.onBroadcastTranscript?.(entry);
    }
  }

  // --------------------
  // DISCONNECT
  // --------------------
  async disconnect() {
    this.isConnected = false;

    if (this.processingInterval) clearInterval(this.processingInterval);
    if (this.bufferLength > 0) await this.processAudioChunk();

    this.processor?.disconnect();
    this.mediaStream?.getTracks().forEach(t => t.stop());
    if (this.inputAudioContext) await this.inputAudioContext.close();

    this.processor = null;
    this.mediaStream = null;
    this.inputAudioContext = null;

    this.config.onDisconnect();
  }

  // --------------------
  // WAV ENCODER
  // --------------------
  private encodeToWAV(samples: Float32Array, sampleRate: number): Blob {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);

    const writeString = (offset: number, str: string) => {
      for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
    };

    writeString(0, "RIFF");
    view.setUint32(4, 36 + samples.length * 2, true);
    writeString(8, "WAVE");
    writeString(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(36, "data");
    view.setUint32(40, samples.length * 2, true);

    let offset = 44;
    for (let i = 0; i < samples.length; i++) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
      offset += 2;
    }

    return new Blob([view], { type: "audio/wav" });
  }
}
