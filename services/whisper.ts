import { WhisperConfig, TranscriptEntry } from '../types';

export class WhisperService {
  private inputAudioContext: AudioContext | null = null;
  private processor: ScriptProcessorNode | null = null;
  private mediaStream: MediaStream | null = null;
  private config: WhisperConfig;
  private isConnected = false;
  
  // Buffering for HTTP Requests
  private audioBuffer: Float32Array[] = [];
  private bufferLength = 0;
  private readonly TARGET_SAMPLE_RATE = 16000;
  private readonly CHUNK_DURATION_SEC = 3; // Send audio every 3 seconds
  private processingInterval: any = null;

  constructor(config: WhisperConfig) {
    this.config = config;
  }

  async connect() {
    if (this.isConnected) return;

    try {
      // Use system default to avoid "connecting AudioNodes from AudioContexts with different sample-rate" error.
      this.inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)();

      this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const source = this.inputAudioContext.createMediaStreamSource(this.mediaStream);
      
      // We use ScriptProcessor to capture raw audio data
      this.processor = this.inputAudioContext.createScriptProcessor(4096, 1, 1);

      this.processor.onaudioprocess = (e) => {
        if (!this.isConnected || !this.inputAudioContext) return;
        
        const inputData = e.inputBuffer.getChannelData(0);
        const currentSampleRate = this.inputAudioContext.sampleRate;

        // Downsample to 16kHz if necessary
        const processedData = this.resampleToTarget(inputData, currentSampleRate);

        this.audioBuffer.push(processedData);
        this.bufferLength += processedData.length;
      };

      source.connect(this.processor);
      this.processor.connect(this.inputAudioContext.destination);

      this.isConnected = true;
      this.config.onConnect();

      // Start the loop to send chunks to Hugging Face
      this.processingInterval = setInterval(() => {
        this.processAudioChunk();
      }, this.CHUNK_DURATION_SEC * 1000);

    } catch (error) {
      this.config.onError(error as Error);
    }
  }

  // Resample Float32 audio data to TARGET_SAMPLE_RATE (16kHz)
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
        
        // Linear interpolation
        const s0 = input[p];
        const s1 = (p + 1 < input.length) ? input[p + 1] : s0;
        
        output[i] = s0 * (1 - t) + s1 * t;
    }
    return output;
  }

  private async processAudioChunk() {
    if (this.bufferLength === 0 || !this.isConnected) return;

    // 1. Flatten buffer
    const flatBuffer = new Float32Array(this.bufferLength);
    let offset = 0;
    for (const chunk of this.audioBuffer) {
      flatBuffer.set(chunk, offset);
      offset += chunk.length;
    }

    // Reset buffer immediately so we don't lose new incoming audio while processing
    this.audioBuffer = [];
    this.bufferLength = 0;

    // 2. Convert to WAV Blob
    const wavBlob = this.encodeToWAV(flatBuffer, this.TARGET_SAMPLE_RATE);

    // 3. Send to Hugging Face
    try {
      await this.sendToHuggingFace(wavBlob);
    } catch (err) {
      console.error("Transcription failed", err);
      // If it's an auth error, we might want to stop everything, but generally we rely on the error to propagate
      if (err instanceof Error && err.message.includes("Authentication")) {
          this.config.onError(err);
          await this.disconnect();
      } else {
        // Report other errors but don't disconnect immediately, might be transient
        console.warn(err);
      }
    }
  }

  private async sendToHuggingFace(audioBlob: Blob) {
    const url = this.config.endpointUrl;
    
    // Send raw binary data with audio/wav content type
    // IMPORTANT: Do NOT wrap in JSON. Send the Blob directly.
    const headers: Record<string, string> = {
      "Content-Type": "audio/wav",
    };

    if (this.config.hfToken) {
      headers["Authorization"] = `Bearer ${this.config.hfToken}`;
    }

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: audioBlob,
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new Error("Authentication failed. For Private/Protected endpoints, check your HF Token.");
      }

      const errorText = await response.text();
      let errorMessage = `HF API Error: ${response.status} ${response.statusText}`;
      
      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson.error) {
           errorMessage = `HF API Error: ${errorJson.error}`;
           // Check if model is loading
           if (typeof errorJson.error === 'string' && errorJson.error.includes("loading")) {
             console.warn("Model is loading...");
             return;
           }
        }
      } catch (e) {
        if (errorText.length < 200) errorMessage += ` - ${errorText}`;
      }
      
      throw new Error(errorMessage);
    }

    const result = await response.json();
    
    // Handle different response formats (Dedicated endpoints might return array or object)
    let text = "";
    if (result && typeof result.text === 'string') {
        text = result.text;
    } else if (Array.isArray(result) && result[0] && result[0].text) {
        text = result[0].text;
    }

    if (text.trim().length > 0) {
      this.config.onTranscription({
        id: Date.now().toString(),
        sender: 'user',
        text: text.trim(),
        timestamp: Date.now(),
        isPartial: false // HTTP requests return final segments usually
      });
    }
  }

  async disconnect() {
    this.isConnected = false;
    
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }

    // Process remaining buffer
    if (this.bufferLength > 0) {
        await this.processAudioChunk();
    }

    if (this.processor) {
      this.processor.disconnect();
      this.processor = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }
    if (this.inputAudioContext) {
      await this.inputAudioContext.close();
      this.inputAudioContext = null;
    }
    
    this.config.onDisconnect();
  }

  // --- WAV ENCODING HELPER ---
  private encodeToWAV(samples: Float32Array, sampleRate: number): Blob {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);

    const writeString = (view: DataView, offset: number, string: string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };

    // RIFF identifier
    writeString(view, 0, 'RIFF');
    // RIFF chunk length
    view.setUint32(4, 36 + samples.length * 2, true);
    // RIFF type
    writeString(view, 8, 'WAVE');
    // format chunk identifier
    writeString(view, 12, 'fmt ');
    // format chunk length
    view.setUint32(16, 16, true);
    // sample format (raw)
    view.setUint16(20, 1, true);
    // channel count
    view.setUint16(22, 1, true);
    // sample rate
    view.setUint32(24, sampleRate, true);
    // byte rate (sample rate * block align)
    view.setUint32(28, sampleRate * 2, true);
    // block align (channel count * bytes per sample)
    view.setUint16(32, 2, true);
    // bits per sample
    view.setUint16(34, 16, true);
    // data chunk identifier
    writeString(view, 36, 'data');
    // data chunk length
    view.setUint32(40, samples.length * 2, true);

    // Write PCM samples
    const length = samples.length;
    let offset = 44;
    for (let i = 0; i < length; i++) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
      offset += 2;
    }

    return new Blob([view], { type: 'audio/wav' });
  }
}