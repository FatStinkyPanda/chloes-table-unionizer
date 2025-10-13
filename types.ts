

export enum AppState {
  UPLOAD = 'UPLOAD',
  PROCESSING = 'PROCESSING',
  MATCHING = 'MATCHING',
  RESULTS = 'RESULTS',
}

export interface UploadedFile {
  id: string;
  file: File;
  name: string;
  columns: ColumnData[];
  rowCount: number;
  sourceId: number;
  color: string;
}

export interface ColumnData {
  fileId: string;
  fileName: string;
  originalName: string; 
  sampleData: any[];
  dataType: 'string' | 'number' | 'boolean' | 'date' | 'mixed';
}

export enum MatchStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  DENIED = 'DENIED',
}

export enum MatchSource {
  PROGRAMMATIC = 'PROGRAMMATIC',
  AI = 'AI',
  MANUAL = 'MANUAL',
}

export interface ColumnInMatch {
  fileId: string;
  fileName: string;
  columnName: string;
}

export enum AIRecommendedAction {
  CONFIRM = 'CONFIRM',
  DENY = 'DENY',
  MODIFY = 'MODIFY',
}

export interface AIReview {
  action: AIRecommendedAction;
  justification: string;
  suggestedColumns?: ColumnInMatch[];
}


export interface Match {
  id: string;
  columns: ColumnInMatch[];
  programmaticConfidence?: number;
  aiConfidence?: number;
  status: MatchStatus;
  finalName: string; 
  source: MatchSource;
  justification?: string; // For AI-created matches
  aiReview?: AIReview; // For AI-reviewed matches
}

export enum AIModel {
    NONE = "None",
    GEMINI = "Google Gemini 2.5 Flash",
    CLAUDE_SONNET = "Claude Sonnet 4.5",
    CLAUDE_OPUS = "Claude Opus 4.1",
    GPT5 = "OpenAI GPT-5",
}
// Multi-provider AI configuration types

export enum AIProvider {
  GEMINI = 'GEMINI',
  ANTHROPIC = 'ANTHROPIC',
}

export interface AIModelInfo {
  id: string;
  name: string;
  provider: AIProvider;
  isCustom: boolean;
}

export interface AIProviderConfig {
  provider: AIProvider;
  apiKey: string;
  selectedModel: string;
  availableModels: AIModelInfo[];
}

export interface AISettings {
  providers: Record<AIProvider, AIProviderConfig>;
  activeProvider: AIProvider;
  apiCallDelay: number;
  maxRetries: number;
}


export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export type ParseResult = {
  uploadedFiles: UploadedFile[];
  alignmentResult: {
    success: boolean;
    message: string;
  };
};