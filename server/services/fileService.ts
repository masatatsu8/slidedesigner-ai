import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ベースディレクトリ: ~/InfographAI/projects/
const BASE_DIR = path.join(os.homedir(), 'InfographAI', 'projects');

/**
 * ディレクトリが存在しない場合は作成
 */
function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * プロジェクト/セッションのディレクトリパスを取得
 */
function getSessionDir(projectId: string, sessionId: string): string {
  return path.join(BASE_DIR, projectId, sessionId);
}

/**
 * 次の画像番号を取得
 */
function getNextImageNumber(sessionDir: string): number {
  ensureDir(sessionDir);

  const files = fs.readdirSync(sessionDir);
  const imageFiles = files.filter(f => /^image-(\d+)\.png$/.test(f));

  if (imageFiles.length === 0) {
    return 1;
  }

  const numbers = imageFiles.map(f => {
    const match = f.match(/^image-(\d+)\.png$/);
    return match ? parseInt(match[1], 10) : 0;
  });

  return Math.max(...numbers) + 1;
}

export interface SaveImageParams {
  projectId: string;
  sessionId: string;
  base64Data: string;
  filename?: string;
}

export interface SavedImageInfo {
  id: string;
  filename: string;
  path: string;
  projectId: string;
  sessionId: string;
  createdAt: number;
}

export interface ImageInfo {
  id: string;
  filename: string;
  path: string;
  createdAt: number;
  size: number;
}

/**
 * 画像をローカルファイルとして保存
 */
export function saveImage(params: SaveImageParams): SavedImageInfo {
  const { projectId, sessionId, base64Data, filename } = params;

  const sessionDir = getSessionDir(projectId, sessionId);
  ensureDir(sessionDir);

  // ファイル名を決定
  const imageNumber = getNextImageNumber(sessionDir);
  const finalFilename = filename || `image-${String(imageNumber).padStart(3, '0')}.png`;
  const filePath = path.join(sessionDir, finalFilename);

  // Base64からバッファに変換して保存
  const buffer = Buffer.from(base64Data, 'base64');
  fs.writeFileSync(filePath, buffer);

  const id = `${projectId}-${sessionId}-${finalFilename}`;

  return {
    id,
    filename: finalFilename,
    path: filePath,
    projectId,
    sessionId,
    createdAt: Date.now(),
  };
}

/**
 * セッションの画像一覧を取得
 */
export function getImagesForSession(projectId: string, sessionId: string): ImageInfo[] {
  const sessionDir = getSessionDir(projectId, sessionId);

  if (!fs.existsSync(sessionDir)) {
    return [];
  }

  const files = fs.readdirSync(sessionDir);
  const imageFiles = files.filter(f => /\.(png|jpg|jpeg|gif|webp)$/i.test(f));

  return imageFiles.map(filename => {
    const filePath = path.join(sessionDir, filename);
    const stats = fs.statSync(filePath);

    return {
      id: `${projectId}-${sessionId}-${filename}`,
      filename,
      path: filePath,
      createdAt: stats.mtimeMs,
      size: stats.size,
    };
  }).sort((a, b) => a.createdAt - b.createdAt);
}

/**
 * 画像を削除
 */
export function deleteImage(projectId: string, sessionId: string, filename: string): boolean {
  const sessionDir = getSessionDir(projectId, sessionId);
  const filePath = path.join(sessionDir, filename);

  if (!fs.existsSync(filePath)) {
    return false;
  }

  fs.unlinkSync(filePath);
  return true;
}

/**
 * 画像をBase64として読み込み
 */
export function getImageAsBase64(projectId: string, sessionId: string, filename: string): string | null {
  const sessionDir = getSessionDir(projectId, sessionId);
  const filePath = path.join(sessionDir, filename);

  if (!fs.existsSync(filePath)) {
    return null;
  }

  const buffer = fs.readFileSync(filePath);
  return buffer.toString('base64');
}

/**
 * 画像ファイルのパスを取得
 */
export function getImagePath(projectId: string, sessionId: string, filename: string): string | null {
  const sessionDir = getSessionDir(projectId, sessionId);
  const filePath = path.join(sessionDir, filename);

  if (!fs.existsSync(filePath)) {
    return null;
  }

  return filePath;
}

/**
 * プロジェクトの全画像を取得
 */
export function getImagesForProject(projectId: string): { sessionId: string; images: ImageInfo[] }[] {
  const projectDir = path.join(BASE_DIR, projectId);

  if (!fs.existsSync(projectDir)) {
    return [];
  }

  const sessions = fs.readdirSync(projectDir);

  return sessions
    .filter(sessionId => {
      const sessionPath = path.join(projectDir, sessionId);
      return fs.statSync(sessionPath).isDirectory();
    })
    .map(sessionId => ({
      sessionId,
      images: getImagesForSession(projectId, sessionId),
    }))
    .filter(item => item.images.length > 0);
}

/**
 * ベースディレクトリのパスを取得
 */
export function getBasePath(): string {
  return BASE_DIR;
}
