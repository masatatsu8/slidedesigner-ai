import initSqlJs, { Database, SqlJsStatic } from 'sql.js';
import { v4 as uuidv4 } from 'uuid';
import type {
  User,
  UserSettings,
  Project,
  ProjectSettings,
  Session,
  StoredImage,
  Conversation,
  Presentation,
  PresentationPage,
  PresentationSettings,
  ComplexityLevel,
  ImageResolution,
} from '../types';

// テスト環境かどうかを判定
const isTestEnvironment = typeof process !== 'undefined' && process.env.NODE_ENV === 'test';

// WASMファイルのロケーション設定
const getLocateFile = (): ((file: string) => string) | undefined => {
  if (isTestEnvironment) {
    // テスト環境ではnode_modulesからロード
    return (file: string) => `./node_modules/sql.js/dist/${file}`;
  }
  // ブラウザ環境ではCDNからロード
  return (file: string) => `https://sql.js.org/dist/${file}`;
};

// ============================================
// DDL: スキーマ定義
// ============================================

const SCHEMA_DDL = `
-- ユーザー
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    settings TEXT DEFAULT '{}'
);

-- プロジェクト
CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    owner_user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    settings TEXT DEFAULT '{}',
    FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- セッション(プロジェクトに所属)
CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    created_by_user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    input_text TEXT,
    complexity TEXT DEFAULT 'VERY_SIMPLE',
    resolution TEXT DEFAULT '1K',
    design_requests TEXT,
    style_image_base64 TEXT,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
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

-- プレゼンテーション(プロジェクトに所属)
CREATE TABLE IF NOT EXISTS presentations (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    created_by_user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    settings TEXT DEFAULT '{}',
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
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
CREATE INDEX IF NOT EXISTS idx_projects_owner ON projects(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(created_by_user_id);
CREATE INDEX IF NOT EXISTS idx_images_session ON images(session_id);
CREATE INDEX IF NOT EXISTS idx_conversations_session ON conversations(session_id);
CREATE INDEX IF NOT EXISTS idx_presentations_project ON presentations(project_id);
CREATE INDEX IF NOT EXISTS idx_pages_presentation ON presentation_pages(presentation_id);
CREATE INDEX IF NOT EXISTS idx_pages_order ON presentation_pages(presentation_id, page_order);
`;

// ============================================
// カスタムエラー
// ============================================

export class DatabaseError extends Error {
  constructor(
    message: string,
    public code: 'INIT_FAILED' | 'QUERY_FAILED' | 'PERSIST_FAILED' | 'NOT_FOUND',
    public originalError?: unknown
  ) {
    super(message);
    this.name = 'DatabaseError';
  }
}

// ============================================
// データベースサービス
// ============================================

class DatabaseService {
  private db: Database | null = null;
  private initialized: boolean = false;
  private sqlJs: Awaited<ReturnType<typeof initSqlJs>> | null = null;

  // OPFS用のファイル名
  private readonly DB_FILE_NAME = 'infographai.db';

  /**
   * データベースを初期化
   * @param sqlJsInstance - テスト用に外部から注入するSqlJsインスタンス(オプション)
   */
  async initialize(sqlJsInstance?: SqlJsStatic): Promise<void> {
    if (this.initialized && this.db) {
      return;
    }

    try {
      // sql.jsを初期化
      if (sqlJsInstance) {
        this.sqlJs = sqlJsInstance;
      } else {
        this.sqlJs = await initSqlJs({
          locateFile: getLocateFile(),
        });
      }

      // OPFSから既存データを読み込み試行
      const existingData = await this.loadFromOPFS();

      if (existingData) {
        this.db = new this.sqlJs.Database(existingData);
      } else {
        this.db = new this.sqlJs.Database();
        // スキーマを適用
        this.db.run(SCHEMA_DDL);
      }

      // 外部キー制約を有効化
      this.db.run('PRAGMA foreign_keys = ON;');

      this.initialized = true;
    } catch (error) {
      throw new DatabaseError(
        'データベースの初期化に失敗しました',
        'INIT_FAILED',
        error
      );
    }
  }

  /**
   * OPFSからデータベースファイルを読み込み
   */
  private async loadFromOPFS(): Promise<Uint8Array | null> {
    try {
      if (!('storage' in navigator) || !('getDirectory' in navigator.storage)) {
        console.warn('OPFS is not supported, using in-memory database');
        return null;
      }

      const root = await navigator.storage.getDirectory();
      const fileHandle = await root.getFileHandle(this.DB_FILE_NAME, { create: false });
      const file = await fileHandle.getFile();
      const arrayBuffer = await file.arrayBuffer();
      return new Uint8Array(arrayBuffer);
    } catch {
      // ファイルが存在しない場合は新規作成
      return null;
    }
  }

  /**
   * データベースをOPFSに永続化
   */
  async persist(): Promise<void> {
    if (!this.db) {
      throw new DatabaseError('Database not initialized', 'PERSIST_FAILED');
    }

    try {
      if (!('storage' in navigator) || !('getDirectory' in navigator.storage)) {
        console.warn('OPFS is not supported, data will not be persisted');
        return;
      }

      const data = this.db.export();
      const root = await navigator.storage.getDirectory();
      const fileHandle = await root.getFileHandle(this.DB_FILE_NAME, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(data);
      await writable.close();
    } catch (error) {
      throw new DatabaseError(
        'データベースの永続化に失敗しました',
        'PERSIST_FAILED',
        error
      );
    }
  }

  /**
   * データベースをエクスポート
   */
  async exportDatabase(): Promise<Uint8Array> {
    if (!this.db) {
      throw new DatabaseError('Database not initialized', 'QUERY_FAILED');
    }
    return this.db.export();
  }

  /**
   * データベースをインポート
   */
  async importDatabase(data: Uint8Array): Promise<void> {
    if (!this.sqlJs) {
      throw new DatabaseError('sql.js not initialized', 'INIT_FAILED');
    }

    if (this.db) {
      this.db.close();
    }

    this.db = new this.sqlJs.Database(data);
    await this.persist();
  }

  /**
   * データベースをリセット(テスト用)
   */
  async reset(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
    this.initialized = false;

    // OPFSからファイルを削除
    try {
      if ('storage' in navigator && 'getDirectory' in navigator.storage) {
        const root = await navigator.storage.getDirectory();
        await root.removeEntry(this.DB_FILE_NAME);
      }
    } catch {
      // ファイルが存在しない場合は無視
    }
  }

  // ============================================
  // ユーザー操作
  // ============================================

  async createUser(user: Omit<User, 'createdAt' | 'updatedAt' | 'settings'> & { settings?: UserSettings }): Promise<User> {
    if (!this.db) throw new DatabaseError('Database not initialized', 'QUERY_FAILED');

    const now = Date.now();
    const settings = user.settings || {};

    this.db.run(
      `INSERT INTO users (id, name, email, created_at, updated_at, settings)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [user.id, user.name, user.email, now, now, JSON.stringify(settings)]
    );

    await this.persist();

    return {
      ...user,
      createdAt: now,
      updatedAt: now,
      settings,
    };
  }

  async getUser(id: string): Promise<User | null> {
    if (!this.db) throw new DatabaseError('Database not initialized', 'QUERY_FAILED');

    const result = this.db.exec(
      `SELECT id, name, email, created_at, updated_at, settings FROM users WHERE id = ?`,
      [id]
    );

    if (result.length === 0 || result[0].values.length === 0) {
      return null;
    }

    const row = result[0].values[0];
    return {
      id: row[0] as string,
      name: row[1] as string,
      email: row[2] as string,
      createdAt: row[3] as number,
      updatedAt: row[4] as number,
      settings: JSON.parse(row[5] as string || '{}'),
    };
  }

  async updateUser(id: string, updates: Partial<Omit<User, 'id' | 'createdAt'>>): Promise<void> {
    if (!this.db) throw new DatabaseError('Database not initialized', 'QUERY_FAILED');

    const now = Date.now();
    const setClauses: string[] = ['updated_at = ?'];
    const values: unknown[] = [now];

    if (updates.name !== undefined) {
      setClauses.push('name = ?');
      values.push(updates.name);
    }
    if (updates.email !== undefined) {
      setClauses.push('email = ?');
      values.push(updates.email);
    }
    if (updates.settings !== undefined) {
      setClauses.push('settings = ?');
      values.push(JSON.stringify(updates.settings));
    }

    values.push(id);
    this.db.run(
      `UPDATE users SET ${setClauses.join(', ')} WHERE id = ?`,
      values
    );

    await this.persist();
  }

  // ============================================
  // プロジェクト操作
  // ============================================

  async createProject(
    project: Omit<Project, 'id' | 'createdAt' | 'updatedAt' | 'settings'> & { settings?: ProjectSettings }
  ): Promise<Project> {
    if (!this.db) throw new DatabaseError('Database not initialized', 'QUERY_FAILED');

    const id = uuidv4();
    const now = Date.now();
    const settings = project.settings || {};

    this.db.run(
      `INSERT INTO projects (id, owner_user_id, name, description, created_at, updated_at, settings)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, project.ownerUserId, project.name, project.description, now, now, JSON.stringify(settings)]
    );

    await this.persist();

    return {
      id,
      ownerUserId: project.ownerUserId,
      name: project.name,
      description: project.description,
      createdAt: now,
      updatedAt: now,
      settings,
    };
  }

  async getProject(id: string): Promise<Project | null> {
    if (!this.db) throw new DatabaseError('Database not initialized', 'QUERY_FAILED');

    const result = this.db.exec(
      `SELECT id, owner_user_id, name, description, created_at, updated_at, settings
       FROM projects WHERE id = ?`,
      [id]
    );

    if (result.length === 0 || result[0].values.length === 0) {
      return null;
    }

    const row = result[0].values[0];
    return {
      id: row[0] as string,
      ownerUserId: row[1] as string,
      name: row[2] as string,
      description: row[3] as string,
      createdAt: row[4] as number,
      updatedAt: row[5] as number,
      settings: JSON.parse(row[6] as string || '{}'),
    };
  }

  async getProjectsByUser(userId: string): Promise<Project[]> {
    if (!this.db) throw new DatabaseError('Database not initialized', 'QUERY_FAILED');

    const result = this.db.exec(
      `SELECT id, owner_user_id, name, description, created_at, updated_at, settings
       FROM projects WHERE owner_user_id = ? ORDER BY updated_at DESC`,
      [userId]
    );

    if (result.length === 0) {
      return [];
    }

    return result[0].values.map((row) => ({
      id: row[0] as string,
      ownerUserId: row[1] as string,
      name: row[2] as string,
      description: row[3] as string,
      createdAt: row[4] as number,
      updatedAt: row[5] as number,
      settings: JSON.parse(row[6] as string || '{}'),
    }));
  }

  async updateProject(id: string, updates: Partial<Omit<Project, 'id' | 'createdAt' | 'ownerUserId'>>): Promise<void> {
    if (!this.db) throw new DatabaseError('Database not initialized', 'QUERY_FAILED');

    const now = Date.now();
    const setClauses: string[] = ['updated_at = ?'];
    const values: unknown[] = [now];

    if (updates.name !== undefined) {
      setClauses.push('name = ?');
      values.push(updates.name);
    }
    if (updates.description !== undefined) {
      setClauses.push('description = ?');
      values.push(updates.description);
    }
    if (updates.settings !== undefined) {
      setClauses.push('settings = ?');
      values.push(JSON.stringify(updates.settings));
    }

    values.push(id);
    this.db.run(
      `UPDATE projects SET ${setClauses.join(', ')} WHERE id = ?`,
      values
    );

    await this.persist();
  }

  async deleteProject(id: string): Promise<void> {
    if (!this.db) throw new DatabaseError('Database not initialized', 'QUERY_FAILED');

    this.db.run(`DELETE FROM projects WHERE id = ?`, [id]);
    await this.persist();
  }

  // ============================================
  // セッション操作
  // ============================================

  async createSession(
    session: Omit<Session, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<Session> {
    if (!this.db) throw new DatabaseError('Database not initialized', 'QUERY_FAILED');

    const id = uuidv4();
    const now = Date.now();

    this.db.run(
      `INSERT INTO sessions (id, project_id, created_by_user_id, name, created_at, updated_at,
         input_text, complexity, resolution, design_requests, style_image_base64)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        session.projectId,
        session.createdByUserId,
        session.name,
        now,
        now,
        session.inputText,
        session.complexity,
        session.resolution,
        session.designRequests,
        session.styleImageBase64,
      ]
    );

    await this.persist();

    return {
      id,
      ...session,
      createdAt: now,
      updatedAt: now,
    };
  }

  async getSession(id: string): Promise<Session | null> {
    if (!this.db) throw new DatabaseError('Database not initialized', 'QUERY_FAILED');

    const result = this.db.exec(
      `SELECT id, project_id, created_by_user_id, name, created_at, updated_at,
              input_text, complexity, resolution, design_requests, style_image_base64
       FROM sessions WHERE id = ?`,
      [id]
    );

    if (result.length === 0 || result[0].values.length === 0) {
      return null;
    }

    const row = result[0].values[0];
    return {
      id: row[0] as string,
      projectId: row[1] as string,
      createdByUserId: row[2] as string,
      name: row[3] as string,
      createdAt: row[4] as number,
      updatedAt: row[5] as number,
      inputText: row[6] as string,
      complexity: row[7] as ComplexityLevel,
      resolution: row[8] as ImageResolution,
      designRequests: row[9] as string,
      styleImageBase64: row[10] as string | null,
    };
  }

  async getSessionsByProject(projectId: string): Promise<Session[]> {
    if (!this.db) throw new DatabaseError('Database not initialized', 'QUERY_FAILED');

    const result = this.db.exec(
      `SELECT id, project_id, created_by_user_id, name, created_at, updated_at,
              input_text, complexity, resolution, design_requests, style_image_base64
       FROM sessions WHERE project_id = ? ORDER BY updated_at DESC`,
      [projectId]
    );

    if (result.length === 0) {
      return [];
    }

    return result[0].values.map((row) => ({
      id: row[0] as string,
      projectId: row[1] as string,
      createdByUserId: row[2] as string,
      name: row[3] as string,
      createdAt: row[4] as number,
      updatedAt: row[5] as number,
      inputText: row[6] as string,
      complexity: row[7] as ComplexityLevel,
      resolution: row[8] as ImageResolution,
      designRequests: row[9] as string,
      styleImageBase64: row[10] as string | null,
    }));
  }

  async updateSession(id: string, updates: Partial<Omit<Session, 'id' | 'createdAt' | 'projectId' | 'createdByUserId'>>): Promise<void> {
    if (!this.db) throw new DatabaseError('Database not initialized', 'QUERY_FAILED');

    const now = Date.now();
    const setClauses: string[] = ['updated_at = ?'];
    const values: unknown[] = [now];

    if (updates.name !== undefined) {
      setClauses.push('name = ?');
      values.push(updates.name);
    }
    if (updates.inputText !== undefined) {
      setClauses.push('input_text = ?');
      values.push(updates.inputText);
    }
    if (updates.complexity !== undefined) {
      setClauses.push('complexity = ?');
      values.push(updates.complexity);
    }
    if (updates.resolution !== undefined) {
      setClauses.push('resolution = ?');
      values.push(updates.resolution);
    }
    if (updates.designRequests !== undefined) {
      setClauses.push('design_requests = ?');
      values.push(updates.designRequests);
    }
    if (updates.styleImageBase64 !== undefined) {
      setClauses.push('style_image_base64 = ?');
      values.push(updates.styleImageBase64);
    }

    values.push(id);
    this.db.run(
      `UPDATE sessions SET ${setClauses.join(', ')} WHERE id = ?`,
      values
    );

    await this.persist();
  }

  async deleteSession(id: string): Promise<void> {
    if (!this.db) throw new DatabaseError('Database not initialized', 'QUERY_FAILED');

    this.db.run(`DELETE FROM sessions WHERE id = ?`, [id]);
    await this.persist();
  }

  // ============================================
  // 画像操作
  // ============================================

  async saveImage(image: Omit<StoredImage, 'id' | 'createdAt'>): Promise<StoredImage> {
    if (!this.db) throw new DatabaseError('Database not initialized', 'QUERY_FAILED');

    const id = uuidv4();
    const now = Date.now();

    this.db.run(
      `INSERT INTO images (id, session_id, base64_data, prompt, created_at, input_tokens,
         output_tokens, estimated_cost_usd, generation_type, parent_image_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        image.sessionId,
        image.base64Data,
        image.prompt,
        now,
        image.inputTokens,
        image.outputTokens,
        image.estimatedCostUsd,
        image.generationType,
        image.parentImageId,
      ]
    );

    await this.persist();

    return {
      id,
      ...image,
      createdAt: now,
    };
  }

  async getImage(id: string): Promise<StoredImage | null> {
    if (!this.db) throw new DatabaseError('Database not initialized', 'QUERY_FAILED');

    const result = this.db.exec(
      `SELECT id, session_id, base64_data, prompt, created_at, input_tokens,
              output_tokens, estimated_cost_usd, generation_type, parent_image_id
       FROM images WHERE id = ?`,
      [id]
    );

    if (result.length === 0 || result[0].values.length === 0) {
      return null;
    }

    const row = result[0].values[0];
    return {
      id: row[0] as string,
      sessionId: row[1] as string,
      base64Data: row[2] as string,
      prompt: row[3] as string,
      createdAt: row[4] as number,
      inputTokens: row[5] as number,
      outputTokens: row[6] as number,
      estimatedCostUsd: row[7] as number,
      generationType: row[8] as 'initial' | 'refinement',
      parentImageId: row[9] as string | null,
    };
  }

  async getImagesBySession(sessionId: string): Promise<StoredImage[]> {
    if (!this.db) throw new DatabaseError('Database not initialized', 'QUERY_FAILED');

    const result = this.db.exec(
      `SELECT id, session_id, base64_data, prompt, created_at, input_tokens,
              output_tokens, estimated_cost_usd, generation_type, parent_image_id
       FROM images WHERE session_id = ? ORDER BY created_at ASC`,
      [sessionId]
    );

    if (result.length === 0) {
      return [];
    }

    return result[0].values.map((row) => ({
      id: row[0] as string,
      sessionId: row[1] as string,
      base64Data: row[2] as string,
      prompt: row[3] as string,
      createdAt: row[4] as number,
      inputTokens: row[5] as number,
      outputTokens: row[6] as number,
      estimatedCostUsd: row[7] as number,
      generationType: row[8] as 'initial' | 'refinement',
      parentImageId: row[9] as string | null,
    }));
  }

  async deleteImage(id: string): Promise<void> {
    if (!this.db) throw new DatabaseError('Database not initialized', 'QUERY_FAILED');

    this.db.run(`DELETE FROM images WHERE id = ?`, [id]);
    await this.persist();
  }

  // ============================================
  // 会話履歴操作
  // ============================================

  async saveConversation(
    conv: Omit<Conversation, 'id' | 'createdAt'>
  ): Promise<Conversation> {
    if (!this.db) throw new DatabaseError('Database not initialized', 'QUERY_FAILED');

    const id = uuidv4();
    const now = Date.now();

    this.db.run(
      `INSERT INTO conversations (id, session_id, image_id, role, content, created_at, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, conv.sessionId, conv.imageId, conv.role, conv.content, now, JSON.stringify(conv.metadata)]
    );

    await this.persist();

    return {
      id,
      ...conv,
      createdAt: now,
    };
  }

  async getConversationsBySession(sessionId: string): Promise<Conversation[]> {
    if (!this.db) throw new DatabaseError('Database not initialized', 'QUERY_FAILED');

    const result = this.db.exec(
      `SELECT id, session_id, image_id, role, content, created_at, metadata
       FROM conversations WHERE session_id = ? ORDER BY created_at ASC`,
      [sessionId]
    );

    if (result.length === 0) {
      return [];
    }

    return result[0].values.map((row) => ({
      id: row[0] as string,
      sessionId: row[1] as string,
      imageId: row[2] as string | null,
      role: row[3] as 'user' | 'assistant',
      content: row[4] as string,
      createdAt: row[5] as number,
      metadata: JSON.parse(row[6] as string || '{}'),
    }));
  }

  // ============================================
  // プレゼンテーション操作
  // ============================================

  async createPresentation(
    presentation: Omit<Presentation, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<Presentation> {
    if (!this.db) throw new DatabaseError('Database not initialized', 'QUERY_FAILED');

    const id = uuidv4();
    const now = Date.now();

    this.db.run(
      `INSERT INTO presentations (id, project_id, created_by_user_id, name, created_at, updated_at, settings)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, presentation.projectId, presentation.createdByUserId, presentation.name, now, now, JSON.stringify(presentation.settings)]
    );

    await this.persist();

    return {
      id,
      ...presentation,
      createdAt: now,
      updatedAt: now,
    };
  }

  async getPresentation(id: string): Promise<Presentation | null> {
    if (!this.db) throw new DatabaseError('Database not initialized', 'QUERY_FAILED');

    const result = this.db.exec(
      `SELECT id, project_id, created_by_user_id, name, created_at, updated_at, settings
       FROM presentations WHERE id = ?`,
      [id]
    );

    if (result.length === 0 || result[0].values.length === 0) {
      return null;
    }

    const row = result[0].values[0];
    return {
      id: row[0] as string,
      projectId: row[1] as string,
      createdByUserId: row[2] as string,
      name: row[3] as string,
      createdAt: row[4] as number,
      updatedAt: row[5] as number,
      settings: JSON.parse(row[6] as string || '{}'),
    };
  }

  async getPresentationsByProject(projectId: string): Promise<Presentation[]> {
    if (!this.db) throw new DatabaseError('Database not initialized', 'QUERY_FAILED');

    const result = this.db.exec(
      `SELECT id, project_id, created_by_user_id, name, created_at, updated_at, settings
       FROM presentations WHERE project_id = ? ORDER BY updated_at DESC`,
      [projectId]
    );

    if (result.length === 0) {
      return [];
    }

    return result[0].values.map((row) => ({
      id: row[0] as string,
      projectId: row[1] as string,
      createdByUserId: row[2] as string,
      name: row[3] as string,
      createdAt: row[4] as number,
      updatedAt: row[5] as number,
      settings: JSON.parse(row[6] as string || '{}'),
    }));
  }

  async updatePresentation(id: string, updates: Partial<Omit<Presentation, 'id' | 'createdAt' | 'projectId' | 'createdByUserId'>>): Promise<void> {
    if (!this.db) throw new DatabaseError('Database not initialized', 'QUERY_FAILED');

    const now = Date.now();
    const setClauses: string[] = ['updated_at = ?'];
    const values: unknown[] = [now];

    if (updates.name !== undefined) {
      setClauses.push('name = ?');
      values.push(updates.name);
    }
    if (updates.settings !== undefined) {
      setClauses.push('settings = ?');
      values.push(JSON.stringify(updates.settings));
    }

    values.push(id);
    this.db.run(
      `UPDATE presentations SET ${setClauses.join(', ')} WHERE id = ?`,
      values
    );

    await this.persist();
  }

  async deletePresentation(id: string): Promise<void> {
    if (!this.db) throw new DatabaseError('Database not initialized', 'QUERY_FAILED');

    this.db.run(`DELETE FROM presentations WHERE id = ?`, [id]);
    await this.persist();
  }

  // ============================================
  // プレゼンテーションページ操作
  // ============================================

  async addPresentationPage(
    page: Omit<PresentationPage, 'id' | 'createdAt'>
  ): Promise<PresentationPage> {
    if (!this.db) throw new DatabaseError('Database not initialized', 'QUERY_FAILED');

    const id = uuidv4();
    const now = Date.now();

    this.db.run(
      `INSERT INTO presentation_pages (id, presentation_id, image_id, page_order, custom_title, notes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, page.presentationId, page.imageId, page.pageOrder, page.customTitle, page.notes, now]
    );

    await this.persist();

    return {
      id,
      ...page,
      createdAt: now,
    };
  }

  async getPresentationPages(presentationId: string): Promise<PresentationPage[]> {
    if (!this.db) throw new DatabaseError('Database not initialized', 'QUERY_FAILED');

    const result = this.db.exec(
      `SELECT id, presentation_id, image_id, page_order, custom_title, notes, created_at
       FROM presentation_pages WHERE presentation_id = ? ORDER BY page_order ASC`,
      [presentationId]
    );

    if (result.length === 0) {
      return [];
    }

    return result[0].values.map((row) => ({
      id: row[0] as string,
      presentationId: row[1] as string,
      imageId: row[2] as string,
      pageOrder: row[3] as number,
      customTitle: row[4] as string | null,
      notes: row[5] as string | null,
      createdAt: row[6] as number,
    }));
  }

  async updatePresentationPage(id: string, updates: Partial<Omit<PresentationPage, 'id' | 'createdAt' | 'presentationId'>>): Promise<void> {
    if (!this.db) throw new DatabaseError('Database not initialized', 'QUERY_FAILED');

    const setClauses: string[] = [];
    const values: unknown[] = [];

    if (updates.imageId !== undefined) {
      setClauses.push('image_id = ?');
      values.push(updates.imageId);
    }
    if (updates.pageOrder !== undefined) {
      setClauses.push('page_order = ?');
      values.push(updates.pageOrder);
    }
    if (updates.customTitle !== undefined) {
      setClauses.push('custom_title = ?');
      values.push(updates.customTitle);
    }
    if (updates.notes !== undefined) {
      setClauses.push('notes = ?');
      values.push(updates.notes);
    }

    if (setClauses.length === 0) return;

    values.push(id);
    this.db.run(
      `UPDATE presentation_pages SET ${setClauses.join(', ')} WHERE id = ?`,
      values
    );

    await this.persist();
  }

  async deletePresentationPage(id: string): Promise<void> {
    if (!this.db) throw new DatabaseError('Database not initialized', 'QUERY_FAILED');

    this.db.run(`DELETE FROM presentation_pages WHERE id = ?`, [id]);
    await this.persist();
  }

  async reorderPresentationPages(presentationId: string, pageIds: string[]): Promise<void> {
    if (!this.db) throw new DatabaseError('Database not initialized', 'QUERY_FAILED');

    pageIds.forEach((pageId, index) => {
      this.db!.run(
        `UPDATE presentation_pages SET page_order = ? WHERE id = ? AND presentation_id = ?`,
        [index, pageId, presentationId]
      );
    });

    await this.persist();
  }

  // ============================================
  // 統計・集計
  // ============================================

  async getSessionImageCount(sessionId: string): Promise<number> {
    if (!this.db) throw new DatabaseError('Database not initialized', 'QUERY_FAILED');

    const result = this.db.exec(
      `SELECT COUNT(*) FROM images WHERE session_id = ?`,
      [sessionId]
    );

    if (result.length === 0 || result[0].values.length === 0) {
      return 0;
    }

    return result[0].values[0][0] as number;
  }

  async getProjectSessionCount(projectId: string): Promise<number> {
    if (!this.db) throw new DatabaseError('Database not initialized', 'QUERY_FAILED');

    const result = this.db.exec(
      `SELECT COUNT(*) FROM sessions WHERE project_id = ?`,
      [projectId]
    );

    if (result.length === 0 || result[0].values.length === 0) {
      return 0;
    }

    return result[0].values[0][0] as number;
  }

  async getProjectImageCount(projectId: string): Promise<number> {
    if (!this.db) throw new DatabaseError('Database not initialized', 'QUERY_FAILED');

    const result = this.db.exec(
      `SELECT COUNT(*) FROM images i
       JOIN sessions s ON i.session_id = s.id
       WHERE s.project_id = ?`,
      [projectId]
    );

    if (result.length === 0 || result[0].values.length === 0) {
      return 0;
    }

    return result[0].values[0][0] as number;
  }
}

// シングルトンインスタンスをエクスポート
export const dbService = new DatabaseService();
