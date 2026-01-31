// ============================================
// 既存の型定義 (後方互換性のため維持)
// ============================================

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

// ============================================
// 新規: データ永続化レイヤー用型定義
// ============================================

// ユーザー設定
export interface UserSettings {
  theme?: 'light' | 'dark';
  language?: string;
}

// ユーザー
export interface User {
  id: string;
  name: string;
  email: string;
  createdAt: number;
  updatedAt: number;
  settings: UserSettings;
}

// プロジェクト設定
export interface ProjectSettings {
  defaultComplexity?: ComplexityLevel;
  defaultResolution?: ImageResolution;
}

// プロジェクト
export interface Project {
  id: string;
  ownerUserId: string;
  name: string;
  description: string;
  createdAt: number;
  updatedAt: number;
  settings: ProjectSettings;
}

// セッション
export interface Session {
  id: string;
  projectId: string;
  createdByUserId: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  inputText: string;
  complexity: ComplexityLevel;
  resolution: ImageResolution;
  designRequests: string;
  styleImageBase64: string | null;
}

// 保存された画像
export interface StoredImage {
  id: string;
  sessionId: string;
  base64Data: string;
  prompt: string;
  createdAt: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  generationType: 'initial' | 'refinement';
  parentImageId: string | null;
}

// 会話履歴
export interface Conversation {
  id: string;
  sessionId: string;
  imageId: string | null;
  role: 'user' | 'assistant';
  content: string;
  createdAt: number;
  metadata: Record<string, unknown>;
}

// ============================================
// フェーズ2: オーサリングモード用型定義
// ============================================

// ページ番号設定
export interface PageNumberSettings {
  enabled: boolean;
  position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  format: 'number' | 'number-total' | 'roman';
  fontSize: number;
  color: string;
}

// コピーライト設定
export interface CopyrightSettings {
  enabled: boolean;
  text: string;
  position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  fontSize: number;
  color: string;
}

// 透かし設定
export interface WatermarkSettings {
  enabled: boolean;
  type: 'text' | 'image';
  text?: string;
  imageBase64?: string;
  position: 'center' | 'tile';
  opacity: number;
}

// プレゼンテーション設定
export interface PresentationSettings {
  pageNumber: PageNumberSettings;
  copyright: CopyrightSettings;
  watermark: WatermarkSettings;
}

// プレゼンテーション
export interface Presentation {
  id: string;
  projectId: string;
  createdByUserId: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  settings: PresentationSettings;
}

// プレゼンテーションページ
export interface PresentationPage {
  id: string;
  presentationId: string;
  imageId: string;
  pageOrder: number;
  customTitle: string | null;
  notes: string | null;
  createdAt: number;
}

// ============================================
// ビューモード
// ============================================

export enum ViewMode {
  PROJECT_LIST = 'PROJECT_LIST',
  SESSION_LIST = 'SESSION_LIST',
  CREATE = 'CREATE',
  AUTHOR = 'AUTHOR'
}
