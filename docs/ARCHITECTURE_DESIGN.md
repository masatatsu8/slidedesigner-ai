# InfographAI アーキテクチャ設計書

**Version**: 2.0
**Date**: 2026-01-30
**Status**: 設計レビュー待ち

---

## 目次

1. [現状分析](#1-現状分析)
2. [要件定義](#2-要件定義)
3. [アーキテクチャ概要](#3-アーキテクチャ概要)
4. [データベース設計](#4-データベース設計)
5. [フェーズ1: データ永続化レイヤー](#5-フェーズ1-データ永続化レイヤー)
6. [フェーズ2: オーサリングモード](#6-フェーズ2-オーサリングモード)
7. [実装計画](#7-実装計画)
8. [テスト計画](#8-テスト計画)
9. [技術的考慮事項](#9-技術的考慮事項)
10. [リスクと対策](#10-リスクと対策)

---

## 1. 現状分析

### 1.1 現在のアーキテクチャ

```
┌─────────────────────────────────────────────────────────────┐
│                        App.tsx                               │
│  ┌─────────────────────────────────────────────────────────┐│
│  │              React State (useState)                      ││
│  │  - inputText, complexity, resolution                     ││
│  │  - generatedImages[], history[]                          ││
│  │  - selectedImageId, refinementInput                      ││
│  │  - suggestions[], appState                               ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
                              │
         ┌────────────────────┼────────────────────┐
         ▼                    ▼                    ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│ geminiService   │  │ driveService    │  │ pptService      │
│ - generate      │  │ - OAuth         │  │ - export        │
│ - edit          │  │ - upload        │  │                 │
│ - suggestions   │  │                 │  │                 │
└─────────────────┘  └─────────────────┘  └─────────────────┘
```

### 1.2 現在の課題

| 課題 | 詳細 | 影響度 |
|------|------|--------|
| **セッション限定データ** | ページリロードで全データ消失 | 高 |
| **会話履歴なし** | プロンプトとレスポンスの記録が残らない | 高 |
| **単一画像のみ** | 複数ページの組み合わせ不可 | 高 |
| **オーサリング機能なし** | ストーリー構成・並び替え不可 | 高 |
| **メタデータ管理なし** | ページ番号・透かし追加不可 | 中 |

### 1.3 現在のデータフロー

```
User Input → Gemini API → Base64 Image → React State (volatile)
                                              ↓
                                    Google Drive (optional)
```

**問題点**: React Stateはメモリ上にのみ存在し、永続化されない。

---

## 2. 要件定義

### 2.1 機能要件

#### フェーズ1: データ永続化

| ID | 要件 | 優先度 |
|----|------|--------|
| F1.1 | すべてのセッションデータをSQLiteに保存 | Must |
| F1.2 | 入力テキスト・パラメータの保存 | Must |
| F1.3 | 生成画像のBase64データ保存 | Must |
| F1.4 | プロンプトとレスポンス履歴の保存 | Must |
| F1.5 | セッション一覧表示と再開機能 | Must |
| F1.6 | セッション削除機能 | Should |
| F1.7 | データエクスポート機能 | Could |

#### フェーズ2: オーサリングモード

| ID | 要件 | 優先度 |
|----|------|--------|
| F2.1 | 画像選択・プレゼンテーション追加 | Must |
| F2.2 | ページの並び替え（ドラッグ&ドロップ） | Must |
| F2.3 | ページ番号の一括追加 | Must |
| F2.4 | コピーライト表示の一括追加 | Must |
| F2.5 | 透かし（ウォーターマーク）追加 | Should |
| F2.6 | ページ削除・複製 | Must |
| F2.7 | プレゼンテーション保存・読み込み | Must |
| F2.8 | PowerPointエクスポート（複数ページ） | Must |

### 2.2 非機能要件

| ID | 要件 | 詳細 |
|----|------|------|
| NF1 | パフォーマンス | 画像100枚でも3秒以内に読み込み |
| NF2 | ストレージ容量 | 最大1GBまでのローカルストレージ対応 |
| NF3 | オフライン動作 | DB読み書きはオフラインで動作 |
| NF4 | ブラウザ互換性 | Chrome, Edge, Safari (最新版) |

---

## 3. アーキテクチャ概要

### 3.1 新アーキテクチャ

```
┌──────────────────────────────────────────────────────────────────────┐
│                              Views                                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────────┐│
│  │ CreateView   │  │ AuthorView   │  │ SessionListView              ││
│  │ (画像生成)   │  │ (オーサリング)│  │ (セッション一覧)            ││
│  └──────────────┘  └──────────────┘  └──────────────────────────────┘│
└──────────────────────────────────────────────────────────────────────┘
                              │
┌──────────────────────────────────────────────────────────────────────┐
│                         State Management                              │
│  ┌──────────────────────────────────────────────────────────────────┐│
│  │                     React Context + Reducer                       ││
│  │  - AppContext (global state)                                      ││
│  │  - SessionContext (current session)                               ││
│  │  - PresentationContext (authoring state)                          ││
│  └──────────────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────────────┘
                              │
┌──────────────────────────────────────────────────────────────────────┐
│                         Service Layer                                 │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────────┐  │
│  │ dbService  │  │ gemini     │  │ drive      │  │ presentation   │  │
│  │            │  │ Service    │  │ Service    │  │ Service        │  │
│  └────────────┘  └────────────┘  └────────────┘  └────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
                              │
┌──────────────────────────────────────────────────────────────────────┐
│                         Data Layer                                    │
│  ┌──────────────────────────────────────────────────────────────────┐│
│  │                  SQLite (sql.js / OPFS)                           ││
│  │  Tables: sessions, images, conversations, presentations, pages   ││
│  └──────────────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────────────┘
```

### 3.2 モード遷移図

```
┌─────────────────┐
│  Session List   │ ◄──────────────────────────────────────┐
│  (ホーム画面)   │                                        │
└────────┬────────┘                                        │
         │                                                 │
    ┌────┴────┐                                           │
    ▼         ▼                                           │
┌────────┐  ┌────────────────┐                           │
│新規作成│  │既存セッション   │                           │
│        │  │を開く           │                           │
└───┬────┘  └───────┬────────┘                           │
    │               │                                     │
    └───────┬───────┘                                     │
            ▼                                             │
┌───────────────────────────────────────┐                │
│         Create Mode (画像作成)         │                │
│  INPUT → GENERATING → GALLERY → REFINE │                │
└───────────────────┬───────────────────┘                │
                    │                                     │
                    │ 「オーサリングへ」                   │
                    ▼                                     │
┌───────────────────────────────────────┐                │
│        Author Mode (オーサリング)       │                │
│  SELECT → ARRANGE → DECORATE → EXPORT  │                │
└───────────────────┬───────────────────┘                │
                    │                                     │
                    └─────────────────────────────────────┘
```

---

## 4. データベース設計

### 4.1 技術選定: sql.js (SQLite compiled to WebAssembly)

**選定理由**:
- ブラウザ内でSQLiteを完全動作
- 標準SQLが使用可能
- OPFS (Origin Private File System) との連携で永続化
- 既存のSQLiteツールでデバッグ可能

**代替案との比較**:

| 技術 | メリット | デメリット |
|------|----------|------------|
| **sql.js + OPFS** | SQLite完全互換、大容量対応 | WASMロード時間 |
| IndexedDB | ネイティブサポート | NoSQL、複雑なクエリ困難 |
| localStorage | シンプル | 5MB制限、同期のみ |

### 4.2 ERダイアグラム

```
┌─────────────────────────────────────────────────────────────────────┐
│                            sessions                                  │
├─────────────────────────────────────────────────────────────────────┤
│ id (TEXT PK)                                                        │
│ name (TEXT)                                                         │
│ created_at (INTEGER)                                                │
│ updated_at (INTEGER)                                                │
│ input_text (TEXT)                                                   │
│ complexity (TEXT)                                                   │
│ resolution (TEXT)                                                   │
│ design_requests (TEXT)                                              │
│ style_image_base64 (TEXT NULL)                                      │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ 1:N
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                             images                                   │
├─────────────────────────────────────────────────────────────────────┤
│ id (TEXT PK)                                                        │
│ session_id (TEXT FK → sessions.id)                                  │
│ base64_data (TEXT)                                                  │
│ prompt (TEXT)                                                       │
│ created_at (INTEGER)                                                │
│ input_tokens (INTEGER)                                              │
│ output_tokens (INTEGER)                                             │
│ estimated_cost_usd (REAL)                                           │
│ generation_type (TEXT: 'initial' | 'refinement')                    │
│ parent_image_id (TEXT NULL FK → images.id)                          │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ 1:N
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                          conversations                               │
├─────────────────────────────────────────────────────────────────────┤
│ id (TEXT PK)                                                        │
│ session_id (TEXT FK → sessions.id)                                  │
│ image_id (TEXT FK → images.id)                                      │
│ role (TEXT: 'user' | 'assistant')                                   │
│ content (TEXT)                                                      │
│ created_at (INTEGER)                                                │
│ metadata (TEXT JSON)                                                │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                          presentations                               │
├─────────────────────────────────────────────────────────────────────┤
│ id (TEXT PK)                                                        │
│ name (TEXT)                                                         │
│ created_at (INTEGER)                                                │
│ updated_at (INTEGER)                                                │
│ settings (TEXT JSON) -- page_number_style, copyright, watermark    │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ 1:N
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         presentation_pages                           │
├─────────────────────────────────────────────────────────────────────┤
│ id (TEXT PK)                                                        │
│ presentation_id (TEXT FK → presentations.id)                        │
│ image_id (TEXT FK → images.id)                                      │
│ page_order (INTEGER)                                                │
│ custom_title (TEXT NULL)                                            │
│ notes (TEXT NULL)                                                   │
│ created_at (INTEGER)                                                │
└─────────────────────────────────────────────────────────────────────┘
```

### 4.3 DDL (テーブル定義)

```sql
-- セッション
CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    input_text TEXT,
    complexity TEXT DEFAULT 'VERY_SIMPLE',
    resolution TEXT DEFAULT '1K',
    design_requests TEXT,
    style_image_base64 TEXT
);

-- 画像
CREATE TABLE IF NOT EXISTS images (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    base64_data TEXT NOT NULL,
    prompt TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    input_tokens INTEGER DEFAULT 0,
    output_tokens INTEGER DEFAULT 0,
    estimated_cost_usd REAL DEFAULT 0,
    generation_type TEXT DEFAULT 'initial',
    parent_image_id TEXT,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_image_id) REFERENCES images(id) ON DELETE SET NULL
);

-- 会話履歴
CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    image_id TEXT,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    metadata TEXT,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (image_id) REFERENCES images(id) ON DELETE SET NULL
);

-- プレゼンテーション
CREATE TABLE IF NOT EXISTS presentations (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    settings TEXT DEFAULT '{}'
);

-- プレゼンテーションページ
CREATE TABLE IF NOT EXISTS presentation_pages (
    id TEXT PRIMARY KEY,
    presentation_id TEXT NOT NULL,
    image_id TEXT NOT NULL,
    page_order INTEGER NOT NULL,
    custom_title TEXT,
    notes TEXT,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (presentation_id) REFERENCES presentations(id) ON DELETE CASCADE,
    FOREIGN KEY (image_id) REFERENCES images(id) ON DELETE CASCADE
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_images_session ON images(session_id);
CREATE INDEX IF NOT EXISTS idx_conversations_session ON conversations(session_id);
CREATE INDEX IF NOT EXISTS idx_pages_presentation ON presentation_pages(presentation_id);
CREATE INDEX IF NOT EXISTS idx_pages_order ON presentation_pages(presentation_id, page_order);
```

---

## 5. フェーズ1: データ永続化レイヤー

### 5.1 ディレクトリ構造

```
slidedesigner-ai/
├── App.tsx
├── types.ts                    # 拡張
├── contexts/                   # 新規
│   ├── AppContext.tsx
│   ├── SessionContext.tsx
│   └── DatabaseContext.tsx
├── services/
│   ├── geminiService.ts        # 既存
│   ├── driveService.ts         # 既存
│   ├── pptService.ts           # 既存
│   └── dbService.ts            # 新規
├── hooks/                      # 新規
│   ├── useDatabase.ts
│   ├── useSession.ts
│   └── useImages.ts
├── views/                      # 新規
│   ├── SessionListView.tsx
│   ├── CreateView.tsx          # App.tsxから分離
│   └── AuthorView.tsx          # フェーズ2
└── components/
    ├── Header.tsx              # 既存
    ├── Spinner.tsx             # 既存
    ├── SessionCard.tsx         # 新規
    └── ImageThumbnail.tsx      # 新規
```

### 5.2 dbService.ts インターフェース設計

```typescript
// services/dbService.ts

import initSqlJs, { Database } from 'sql.js';

// 型定義
export interface Session {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  inputText: string;
  complexity: ComplexityLevel;
  resolution: ImageResolution;
  designRequests: string;
  styleImageBase64: string | null;
}

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

export interface Conversation {
  id: string;
  sessionId: string;
  imageId: string | null;
  role: 'user' | 'assistant';
  content: string;
  createdAt: number;
  metadata: Record<string, any>;
}

// DBサービスクラス
class DatabaseService {
  private db: Database | null = null;
  private initialized: boolean = false;

  // 初期化
  async initialize(): Promise<void>;

  // データベース永続化 (OPFS)
  async persist(): Promise<void>;

  // セッション操作
  async createSession(session: Omit<Session, 'id' | 'createdAt' | 'updatedAt'>): Promise<Session>;
  async getSession(id: string): Promise<Session | null>;
  async getAllSessions(): Promise<Session[]>;
  async updateSession(id: string, updates: Partial<Session>): Promise<void>;
  async deleteSession(id: string): Promise<void>;

  // 画像操作
  async saveImage(image: Omit<StoredImage, 'id' | 'createdAt'>): Promise<StoredImage>;
  async getImagesBySession(sessionId: string): Promise<StoredImage[]>;
  async getImage(id: string): Promise<StoredImage | null>;
  async deleteImage(id: string): Promise<void>;

  // 会話操作
  async saveConversation(conv: Omit<Conversation, 'id' | 'createdAt'>): Promise<Conversation>;
  async getConversationsBySession(sessionId: string): Promise<Conversation[]>;

  // エクスポート
  async exportDatabase(): Promise<Uint8Array>;
  async importDatabase(data: Uint8Array): Promise<void>;
}

export const dbService = new DatabaseService();
```

### 5.3 React Context設計

```typescript
// contexts/SessionContext.tsx

interface SessionState {
  currentSession: Session | null;
  images: StoredImage[];
  conversations: Conversation[];
  isLoading: boolean;
  error: string | null;
}

type SessionAction =
  | { type: 'LOAD_SESSION'; payload: Session }
  | { type: 'ADD_IMAGE'; payload: StoredImage }
  | { type: 'ADD_CONVERSATION'; payload: Conversation }
  | { type: 'UPDATE_SESSION'; payload: Partial<Session> }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'CLEAR_SESSION' };

const SessionContext = createContext<{
  state: SessionState;
  dispatch: Dispatch<SessionAction>;
  // Helpers
  loadSession: (id: string) => Promise<void>;
  saveCurrentSession: () => Promise<void>;
  addImage: (image: StoredImage) => Promise<void>;
} | null>(null);
```

### 5.4 データフロー（新規）

```
User Action
    │
    ▼
┌─────────────────┐
│ React Component │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Context Dispatch│
└────────┬────────┘
         │
    ┌────┴────┐
    ▼         ▼
┌────────┐ ┌────────────┐
│ State  │ │ dbService  │
│ Update │ │ .save()    │
└────────┘ └────────────┘
               │
               ▼
         ┌──────────┐
         │ SQLite   │
         │ (sql.js) │
         └──────────┘
               │
               ▼
         ┌──────────┐
         │  OPFS    │
         │ (永続化) │
         └──────────┘
```

---

## 6. フェーズ2: オーサリングモード

### 6.1 オーサリング画面構成

```
┌──────────────────────────────────────────────────────────────────────┐
│  [← セッションに戻る]            オーサリング             [エクスポート]│
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────────────────┐  ┌────────────────────────────────┐│
│  │                             │  │         ページ一覧             ││
│  │                             │  │  ┌────┐ ┌────┐ ┌────┐ ┌────┐  ││
│  │      メインプレビュー       │  │  │ 1  │ │ 2  │ │ 3  │ │ +  │  ││
│  │      (選択中のページ)       │  │  └────┘ └────┘ └────┘ └────┘  ││
│  │                             │  │                                ││
│  │                             │  │  ドラッグ&ドロップで並び替え   ││
│  │                             │  │                                ││
│  └─────────────────────────────┘  └────────────────────────────────┘│
│                                                                      │
│  ┌─────────────────────────────┐  ┌────────────────────────────────┐│
│  │     利用可能な画像          │  │       デコレーション設定       ││
│  │  ┌────┐ ┌────┐ ┌────┐     │  │                                ││
│  │  │img1│ │img2│ │img3│ ... │  │  □ ページ番号を表示            ││
│  │  └────┘ └────┘ └────┘     │  │    位置: [右下 ▼] 書式: [1/N]  ││
│  │                             │  │                                ││
│  │  クリックでページに追加     │  │  □ コピーライトを表示          ││
│  │                             │  │    テキスト: [© 2024 Company] ││
│  │                             │  │                                ││
│  │                             │  │  □ 透かしを追加                ││
│  │                             │  │    画像: [アップロード]        ││
│  │                             │  │    位置: [中央]  透明度: [30%] ││
│  └─────────────────────────────┘  └────────────────────────────────┘│
└──────────────────────────────────────────────────────────────────────┘
```

### 6.2 プレゼンテーション設定の型定義

```typescript
// types.ts (拡張)

interface PageNumberSettings {
  enabled: boolean;
  position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  format: 'number' | 'number-total' | 'roman';  // "1", "1/5", "I"
  fontSize: number;
  color: string;
}

interface CopyrightSettings {
  enabled: boolean;
  text: string;
  position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  fontSize: number;
  color: string;
}

interface WatermarkSettings {
  enabled: boolean;
  type: 'text' | 'image';
  text?: string;
  imageBase64?: string;
  position: 'center' | 'tile';
  opacity: number;  // 0-100
}

interface PresentationSettings {
  pageNumber: PageNumberSettings;
  copyright: CopyrightSettings;
  watermark: WatermarkSettings;
}

interface Presentation {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  settings: PresentationSettings;
}

interface PresentationPage {
  id: string;
  presentationId: string;
  imageId: string;
  pageOrder: number;
  customTitle: string | null;
  notes: string | null;
}
```

### 6.3 presentationService.ts インターフェース設計

```typescript
// services/presentationService.ts

class PresentationService {
  // プレゼンテーション操作
  async createPresentation(name: string): Promise<Presentation>;
  async getPresentation(id: string): Promise<Presentation | null>;
  async getAllPresentations(): Promise<Presentation[]>;
  async updatePresentationSettings(id: string, settings: PresentationSettings): Promise<void>;
  async deletePresentation(id: string): Promise<void>;

  // ページ操作
  async addPage(presentationId: string, imageId: string): Promise<PresentationPage>;
  async removePage(pageId: string): Promise<void>;
  async reorderPages(presentationId: string, pageIds: string[]): Promise<void>;
  async updatePage(pageId: string, updates: Partial<PresentationPage>): Promise<void>;

  // エクスポート
  async exportToPowerPoint(presentationId: string): Promise<void>;
  async exportToPdf(presentationId: string): Promise<void>;
}
```

### 6.4 PowerPointエクスポート拡張

```typescript
// services/pptService.ts (拡張)

/**
 * プレゼンテーションをPowerPointにエクスポート
 * デコレーション（ページ番号、コピーライト、透かし）を適用
 */
export const exportPresentationToPowerPoint = async (
  pages: { imageBase64: string; pageNumber: number }[],
  settings: PresentationSettings,
  fileName: string
): Promise<void> => {
  const pres = new PptxGenJS();
  pres.layout = 'LAYOUT_16x9';

  const totalPages = pages.length;

  for (const page of pages) {
    const slide = pres.addSlide();

    // 1. メイン画像
    slide.addImage({
      data: `data:image/png;base64,${page.imageBase64}`,
      x: 0, y: 0, w: '100%', h: '100%'
    });

    // 2. ページ番号
    if (settings.pageNumber.enabled) {
      const text = formatPageNumber(page.pageNumber, totalPages, settings.pageNumber.format);
      const pos = getPositionCoords(settings.pageNumber.position);
      slide.addText(text, {
        x: pos.x,
        y: pos.y,
        fontSize: settings.pageNumber.fontSize,
        color: settings.pageNumber.color.replace('#', ''),
        fontFace: 'Arial'
      });
    }

    // 3. コピーライト
    if (settings.copyright.enabled) {
      const pos = getPositionCoords(settings.copyright.position);
      slide.addText(settings.copyright.text, {
        x: pos.x,
        y: pos.y,
        fontSize: settings.copyright.fontSize,
        color: settings.copyright.color.replace('#', ''),
        fontFace: 'Arial'
      });
    }

    // 4. 透かし
    if (settings.watermark.enabled) {
      if (settings.watermark.type === 'text') {
        slide.addText(settings.watermark.text!, {
          x: '50%', y: '50%',
          fontSize: 48,
          color: 'CCCCCC',
          transparency: 100 - settings.watermark.opacity
        });
      } else if (settings.watermark.imageBase64) {
        slide.addImage({
          data: `data:image/png;base64,${settings.watermark.imageBase64}`,
          x: '35%', y: '35%', w: '30%', h: '30%',
          transparency: 100 - settings.watermark.opacity
        });
      }
    }
  }

  await pres.writeFile({ fileName });
};
```

---

## 7. 実装計画

### 7.1 フェーズ1: データ永続化 (推定工数: 5-7日)

| ステップ | タスク | 成果物 |
|----------|--------|--------|
| 1.1 | sql.js セットアップ | dbService.ts (初期化・OPFS連携) |
| 1.2 | スキーマ定義・マイグレーション | schema.sql, migrations/ |
| 1.3 | セッションCRUD実装 | dbService.ts (sessions) |
| 1.4 | 画像CRUD実装 | dbService.ts (images) |
| 1.5 | 会話履歴CRUD実装 | dbService.ts (conversations) |
| 1.6 | React Context構築 | contexts/*.tsx |
| 1.7 | セッション一覧画面 | views/SessionListView.tsx |
| 1.8 | 既存App.tsx分離・連携 | views/CreateView.tsx, App.tsx |
| 1.9 | 自動保存機能 | hooks/useAutoSave.ts |
| 1.10 | 統合テスト | tests/integration/ |

### 7.2 フェーズ2: オーサリングモード (推定工数: 7-10日)

| ステップ | タスク | 成果物 |
|----------|--------|--------|
| 2.1 | プレゼンテーションCRUD | dbService.ts (presentations, pages) |
| 2.2 | オーサリング画面基盤 | views/AuthorView.tsx |
| 2.3 | 画像選択・追加機能 | components/ImagePicker.tsx |
| 2.4 | ドラッグ&ドロップ並び替え | components/PageSortable.tsx |
| 2.5 | デコレーション設定UI | components/DecorationPanel.tsx |
| 2.6 | プレビュー機能 | components/PagePreview.tsx |
| 2.7 | PowerPointエクスポート拡張 | services/pptService.ts |
| 2.8 | プレゼンテーション一覧 | components/PresentationList.tsx |
| 2.9 | 統合テスト | tests/integration/ |
| 2.10 | UI/UXブラッシュアップ | 全体 |

### 7.3 依存関係図

```
1.1 ─┬─> 1.2 ─┬─> 1.3 ─┬─> 1.4 ─┬─> 1.5
     │        │        │        │
     │        │        │        └─> 1.6 ─> 1.7 ─> 1.8 ─> 1.9
     │        │        │
     │        │        └─────────────────────────────────────────┐
     │        │                                                   │
     │        └─> 2.1 ─> 2.2 ─┬─> 2.3                            │
     │                        ├─> 2.4                            │
     │                        ├─> 2.5 ─> 2.6                     │
     │                        └─> 2.7 ─> 2.8                     │
     │                                                           │
     └───────────────────────────────────────────────────────────┴─> 2.9 ─> 2.10
```

---

## 8. テスト計画

### 8.1 テスト環境セットアップ

```json
// package.json (追加)
{
  "devDependencies": {
    "vitest": "^1.6.0",
    "@testing-library/react": "^15.0.0",
    "@testing-library/user-event": "^14.5.0",
    "jsdom": "^24.0.0",
    "sql.js": "^1.10.0"
  },
  "scripts": {
    "test": "vitest",
    "test:ui": "vitest --ui",
    "test:coverage": "vitest run --coverage"
  }
}
```

### 8.2 テスト分類

| カテゴリ | 対象 | テスト内容 |
|----------|------|------------|
| **Unit** | dbService | CRUD操作、トランザクション |
| **Unit** | presentationService | ページ操作、設定更新 |
| **Integration** | Context + Service | 状態同期、永続化 |
| **Component** | SessionListView | 表示、操作、エラー |
| **Component** | AuthorView | ドラッグ&ドロップ、設定 |
| **E2E** | Full workflow | セッション作成→画像生成→オーサリング→エクスポート |

### 8.3 テストケース詳細

#### 8.3.1 dbService テスト

```typescript
// tests/services/dbService.test.ts

describe('dbService', () => {
  describe('initialize', () => {
    it('should initialize database with correct schema', async () => {
      await dbService.initialize();
      // Verify tables exist
    });

    it('should persist data to OPFS', async () => {
      await dbService.initialize();
      await dbService.createSession({ name: 'Test' });
      await dbService.persist();
      // Verify file exists in OPFS
    });
  });

  describe('sessions', () => {
    it('should create a new session', async () => {
      const session = await dbService.createSession({
        name: 'Test Session',
        inputText: 'テスト入力',
        complexity: 'VERY_SIMPLE',
        resolution: '1K'
      });
      expect(session.id).toBeDefined();
      expect(session.name).toBe('Test Session');
    });

    it('should retrieve all sessions sorted by updatedAt desc', async () => {
      // Create multiple sessions
      // Verify order
    });

    it('should update session fields', async () => {
      // Create, update, verify
    });

    it('should delete session and cascade to images', async () => {
      // Create session with images
      // Delete session
      // Verify images also deleted
    });
  });

  describe('images', () => {
    it('should save image with token usage', async () => {
      // Test image saving
    });

    it('should retrieve images by session', async () => {
      // Test retrieval
    });

    it('should track parent-child relationship for refinements', async () => {
      // Test parent_image_id
    });
  });
});
```

#### 8.3.2 AuthorView テスト

```typescript
// tests/views/AuthorView.test.tsx

describe('AuthorView', () => {
  describe('page management', () => {
    it('should add image to presentation on click', async () => {
      render(<AuthorView />);
      // Click on image thumbnail
      // Verify page added to presentation
    });

    it('should reorder pages via drag and drop', async () => {
      render(<AuthorView />);
      // Simulate drag and drop
      // Verify new order
    });

    it('should remove page on delete button click', async () => {
      // Test deletion
    });
  });

  describe('decoration settings', () => {
    it('should toggle page number visibility', async () => {
      render(<AuthorView />);
      // Toggle checkbox
      // Verify preview updates
    });

    it('should update copyright text', async () => {
      // Test input change
    });

    it('should upload watermark image', async () => {
      // Test file upload
    });
  });

  describe('export', () => {
    it('should export to PowerPoint with decorations', async () => {
      // Mock pptService
      // Trigger export
      // Verify correct parameters passed
    });
  });
});
```

### 8.4 テストカバレッジ目標

| 対象 | 目標 |
|------|------|
| dbService | 90% |
| presentationService | 90% |
| Context | 80% |
| Components | 70% |
| 全体 | 75% |

---

## 9. 技術的考慮事項

### 9.1 パフォーマンス最適化

#### 画像データの取り扱い

```typescript
// 大量画像対策: サムネイルキャッシュ
interface ImageCache {
  thumbnail: string;  // 縮小版 (200x113px)
  fullLoaded: boolean;
}

// 遅延読み込み
const loadFullImage = async (id: string): Promise<string> => {
  // DBから必要時のみ読み込み
};
```

#### SQLiteクエリ最適化

```sql
-- ページネーション
SELECT * FROM sessions
ORDER BY updated_at DESC
LIMIT 20 OFFSET 0;

-- 部分読み込み (Base64除外)
SELECT id, session_id, prompt, created_at, estimated_cost_usd
FROM images
WHERE session_id = ?;
```

### 9.2 エラーハンドリング

```typescript
// services/dbService.ts

class DatabaseError extends Error {
  constructor(
    message: string,
    public code: 'INIT_FAILED' | 'QUERY_FAILED' | 'PERSIST_FAILED',
    public originalError?: unknown
  ) {
    super(message);
    this.name = 'DatabaseError';
  }
}

// 使用例
try {
  await dbService.initialize();
} catch (error) {
  if (error instanceof DatabaseError && error.code === 'INIT_FAILED') {
    // IndexedDBフォールバック or ユーザー通知
  }
}
```

### 9.3 ブラウザ互換性

| 機能 | Chrome | Edge | Safari | Firefox |
|------|--------|------|--------|---------|
| sql.js (WASM) | ✅ | ✅ | ✅ | ✅ |
| OPFS | ✅ 86+ | ✅ 86+ | ✅ 15.2+ | ✅ 111+ |
| Drag & Drop API | ✅ | ✅ | ✅ | ✅ |

**フォールバック戦略**:
- OPFS非対応 → IndexedDB + メモリDB
- IndexedDB非対応 → メモリ + 警告表示

---

## 10. リスクと対策

### 10.1 リスク一覧

| リスク | 影響度 | 発生確率 | 対策 |
|--------|--------|----------|------|
| OPFSのブラウザ非対応 | 高 | 低 | IndexedDBフォールバック実装 |
| 画像データによるメモリ枯渇 | 高 | 中 | サムネイル + 遅延読み込み |
| sql.js WASMロード失敗 | 高 | 低 | CDNフォールバック + リトライ |
| ドラッグ&ドロップのモバイル対応 | 中 | 中 | touch-action対応ライブラリ使用 |
| PowerPointエクスポートの複雑化 | 中 | 中 | 段階的機能追加、モジュール分離 |

### 10.2 移行戦略

**既存ユーザーデータへの影響**:
- 現在のアプリにはローカルデータがないため、移行は不要
- localStorage内のGoogle Client IDは継続利用

**段階的リリース**:
1. フェーズ1完了後、データ永続化のみリリース
2. フェーズ2完了後、オーサリングモード追加
3. 機能フラグでの段階的有効化も検討

---

## 付録A: 新規追加パッケージ

```json
{
  "dependencies": {
    "sql.js": "^1.10.0",
    "@dnd-kit/core": "^6.1.0",
    "@dnd-kit/sortable": "^8.0.0"
  },
  "devDependencies": {
    "vitest": "^1.6.0",
    "@testing-library/react": "^15.0.0",
    "@testing-library/user-event": "^14.5.0",
    "jsdom": "^24.0.0"
  }
}
```

---

## 付録B: 用語集

| 用語 | 定義 |
|------|------|
| セッション | 1回の画像生成作業の単位。入力パラメータと生成画像を含む |
| オーサリング | 複数の画像を選択・並び替えてプレゼンテーションを作成する作業 |
| プレゼンテーション | 複数ページから構成される出力成果物 |
| デコレーション | ページ番号、コピーライト、透かしなどの装飾要素 |
| OPFS | Origin Private File System。ブラウザのファイルシステムAPI |

---

**Document History**:
- 2026-01-30: 初版作成
