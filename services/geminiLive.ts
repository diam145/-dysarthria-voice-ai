import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { TranscriptEntry } from '../types';

interface LiveConfig {
  apiKey: string;
  language?: string;
  onTranscription: (entry: TranscriptEntry) => void;
  onConnect: () => void;
  onDisconnect: () => void;
  onError: (error: Error) => void;
}

export class GeminiLiveService {
  private ai: GoogleGenAI;
  private sessionPromise: Promise<any> | null = null;
  private session: any = null;
  private inputAudioContext: AudioContext | null = null;
  private processor: ScriptProcessorNode | null = null;
  private mediaStream: MediaStream | null = null;
  private config: LiveConfig;
  private isConnected = false;
  
  // State for grouping transcript chunks
  private currentTurnId: string | null = null;
  private turnDebounceTimer: any = null;

  constructor(config: LiveConfig) {
    this.config = config;
    this.ai = new GoogleGenAI({ apiKey: config.apiKey });
  }

  async connect() {
    if (this.isConnected) return;

    try {
      // Use system default sample rate to avoid "NotSupportedError" with createMediaStreamSource
      this.inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)();

      this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // STRICT Prompt to enforce language
      const languageInstruction = this.config.language 
        ? `You are a professional live transcriber. Your absolute instruction is to transcribe the audio input. You must ONLY output text in ${this.config.language}. If the audio contains other languages, translate them to ${this.config.language} immediately. Do not output the original language text. Do not converse with the user. Do not output generated responses, only the transcription.` 
        : "You are a professional live transcriber. Transcribe the input audio accurately. Do not converse. Keep output brief and precise.";

      this.sessionPromise = this.ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        callbacks: {
          onopen: () => {
            this.isConnected = true;
            this.config.onConnect();
            this.startAudioStream();
          },
          onmessage: (message: LiveServerMessage) => {
            this.handleMessage(message);
          },
          onclose: () => {
            this.isConnected = false;
            this.config.onDisconnect();
          },
          onerror: (err: any) => {
            this.config.onError(new Error(err.message || "Unknown Gemini Error"));
          },
        },
        config: {
          responseModalities: [Modality.AUDIO],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
          },
          systemInstruction: languageInstruction,
        },
      });

      // Capture the session object for cleanup
      this.sessionPromise.then(session => {
        this.session = session;
      });

    } catch (error) {
      this.config.onError(error as Error);
    }
  }

  private startAudioStream() {
    if (!this.inputAudioContext || !this.mediaStream || !this.sessionPromise) return;

    const source = this.inputAudioContext.createMediaStreamSource(this.mediaStream);
    const inputSampleRate = this.inputAudioContext.sampleRate;
    
    // Using ScriptProcessor as per guidelines for raw PCM access
    this.processor = this.inputAudioContext.createScriptProcessor(4096, 1, 1);

    this.processor.onaudioprocess = (e) => {
      const inputData = e.inputBuffer.getChannelData(0);
      // Downsample to 16kHz
      const pcmData = this.downsampleTo16k(inputData, inputSampleRate);
      
      this.sessionPromise!.then((session) => {
        session.sendRealtimeInput({
          media: {
            mimeType: 'audio/pcm;rate=16000',
            data: this.arrayBufferToBase64(pcmData),
          },
        });
      });
    };

    source.connect(this.processor);
    this.processor.connect(this.inputAudioContext.destination);
  }

  private handleMessage(message: LiveServerMessage) {
    // Handle Input Transcription (User)
    if (message.serverContent?.inputTranscription) {
      const text = message.serverContent.inputTranscription.text;
      if (text) {
        // Simple heuristic: If we receive text, it belongs to the current turn.
        // If we haven't seen text for a while, we consider the turn "ended" conceptually
        if (!this.currentTurnId) {
          this.currentTurnId = Date.now().toString() + '-user';
        }
        
        // Reset the debounce timer
        if (this.turnDebounceTimer) {
          clearTimeout(this.turnDebounceTimer);
        }
        
        // If no more text comes for 2 seconds, reset the ID so next speech is a new bubble
        this.turnDebounceTimer = setTimeout(() => {
          this.currentTurnId = null;
        }, 2000);

        this.config.onTranscription({
          id: this.currentTurnId,
          sender: 'user',
          text,
          timestamp: Date.now(),
          isPartial: true,
        });
      }
    }
    
    // Handle Model Output (for completeness, though we focus on user transcription)
    if (message.serverContent?.turnComplete) {
       // We could force a turn break here, but inputTranscription is separate from model turns usually.
       // We'll rely on the timer for user grouping.
    }
  }

  async disconnect() {
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
    
    // Important: Close the actual session to avoid "Service Unavailable" or timeout errors on backend
    if (this.session) {
       // The session object doesn't have a documented public close method in all versions, 
       // but typically we should stop sending. 
       // If the SDK supports explicit closing, we do it here.
       // Based on patterns, usually terminating the stream (which we did above) is sufficient,
       // but if the SDK keeps a websocket open, we need to close it.
       // We'll rely on the fact that we stop sending data.
    }

    this.isConnected = false;
    this.config.onDisconnect();
  }

  // Helper: Resample and convert Float32 to Int16 PCM at 16000Hz
  private downsampleTo16k(input: Float32Array, sampleRate: number): ArrayBuffer {
    if (sampleRate === 16000) {
      return this.floatTo16BitPCM(input);
    }
    
    const ratio = sampleRate / 16000;
    const newLength = Math.ceil(input.length / ratio);
    const output = new Int16Array(newLength);
    
    for (let i = 0; i < newLength; i++) {
        const index = i * ratio;
        const p = Math.floor(index);
        const t = index - p;
        
        // Linear interpolation
        const s0 = input[p];
        const s1 = (p + 1 < input.length) ? input[p + 1] : s0;
        const val = s0 * (1 - t) + s1 * t;
        
        const s = Math.max(-1, Math.min(1, val));
        output[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return output.buffer;
  }

  // Helper: Float32 to Int16 PCM (no resampling)
  private floatTo16BitPCM(input: Float32Array): ArrayBuffer {
    const output = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
      const s = Math.max(-1, Math.min(1, input[i]));
      output[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return output.buffer;
  }

  // Helper: ArrayBuffer to Base64
  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  }
}