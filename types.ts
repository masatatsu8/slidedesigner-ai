
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUSD: number;
}

export interface GeneratedImage {
  id: string;
  url: string;
  base64Data: string; // Store base64 for re-sending to API
  prompt: string;
  timestamp: number;
  usage?: TokenUsage;
}

export interface Suggestion {
  text: string;
}

// Replaced BoundingBox with SplitPoints for better animation logic
export type SplitPoints = number[];

export enum AppState {
  INPUT = 'INPUT',
  GENERATING = 'GENERATING',
  GALLERY = 'GALLERY',
  REFINING = 'REFINING'
}

export enum ComplexityLevel {
  SOLID = 'SOLID',       // しっかり
  LIGHT = 'LIGHT',       // ライトめ
  VERY_SIMPLE = 'VERY_SIMPLE' // 非常にシンプル (Default)
}

export type ImageResolution = '1K' | '2K' | '4K';
