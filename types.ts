export type Theme = 'dark' | 'colorful';

export interface TranscriptEntry {
  id: string;
  sender: 'user' | 'model';
  text: string;
  timestamp: number;
  isPartial?: boolean;
}

export interface Guest {
  id: string;
  name: string;
  status: 'pending' | 'connected' | 'rejected';
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface SignalingMessage {
  type:
    | 'JOIN_REQUEST'
    | 'JOIN_APPROVED'
    | 'JOIN_REJECTED'
    | 'TRANSCRIPT_UPDATE'
    | 'TRANSCRIPT_CLEAR'
    | 'SESSION_ENDED';
  payload?: any;
  senderId?: string;
}

export interface AudioConfig {
  sampleRate: number;
}

/**
 * Whisper streaming configuration
 */
export interface WhisperConfig {
  endpointUrl: string;
  hfToken?: string;

  // 🔥 Core callbacks
  onTranscription: (entry: TranscriptEntry) => void;
  onConnect: () => void;
  onDisconnect: () => void;
  onError: (error: Error) => void;

  // 🔥 New optional callbacks
  // Called when the HF endpoint responds with "model loading"
  onWarmup?: () => void;

  // Called once the first successful transcription is received
  onReady?: () => void;

  // Called to broadcast transcript to guests via Firebase
  onBroadcastTranscript?: (entry: TranscriptEntry) => void;
}
