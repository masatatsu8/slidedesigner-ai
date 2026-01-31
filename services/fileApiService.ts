/**
 * ローカルファイル管理API クライアント
 * Node.jsバックエンドと通信して画像をローカルファイルとして保存
 */

const API_BASE_URL = '/api/files';

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

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  details?: string;
}

/**
 * 画像をローカルファイルとして保存
 */
export async function saveImageToLocal(params: SaveImageParams): Promise<SavedImageInfo> {
  const response = await fetch(`${API_BASE_URL}/save`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    throw new Error(`HTTP error: ${response.status} ${response.statusText}`);
  }

  const result: ApiResponse<SavedImageInfo> = await response.json();

  if (!result.success || !result.data) {
    throw new Error(result.error || 'Failed to save image');
  }

  return result.data;
}

/**
 * セッションの画像一覧を取得
 */
export async function getSessionImages(projectId: string, sessionId: string): Promise<ImageInfo[]> {
  const response = await fetch(`${API_BASE_URL}/${projectId}/${sessionId}`);

  if (!response.ok) {
    throw new Error(`HTTP error: ${response.status} ${response.statusText}`);
  }

  const result: ApiResponse<ImageInfo[]> = await response.json();

  if (!result.success || !result.data) {
    throw new Error(result.error || 'Failed to get images');
  }

  return result.data;
}

/**
 * 画像のURLを取得
 */
export function getImageUrl(projectId: string, sessionId: string, filename: string): string {
  return `${API_BASE_URL}/${projectId}/${sessionId}/${filename}`;
}

/**
 * 画像をBase64として取得
 */
export async function getImageAsBase64(
  projectId: string,
  sessionId: string,
  filename: string
): Promise<string> {
  const response = await fetch(`${API_BASE_URL}/${projectId}/${sessionId}/${filename}/base64`);

  if (!response.ok) {
    throw new Error(`HTTP error: ${response.status} ${response.statusText}`);
  }

  const result: ApiResponse<{ filename: string; base64Data: string }> = await response.json();

  if (!result.success || !result.data) {
    throw new Error(result.error || 'Failed to get image');
  }

  return result.data.base64Data;
}

/**
 * 画像を削除
 */
export async function deleteLocalImage(
  projectId: string,
  sessionId: string,
  filename: string
): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/${projectId}/${sessionId}/${filename}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    throw new Error(`HTTP error: ${response.status} ${response.statusText}`);
  }

  const result: ApiResponse<void> = await response.json();

  if (!result.success) {
    throw new Error(result.error || 'Failed to delete image');
  }
}

/**
 * プロジェクト内の全画像を取得
 */
export async function getProjectImages(
  projectId: string
): Promise<{ sessionId: string; images: ImageInfo[] }[]> {
  const response = await fetch(`${API_BASE_URL}/project/${projectId}`);

  if (!response.ok) {
    throw new Error(`HTTP error: ${response.status} ${response.statusText}`);
  }

  const result: ApiResponse<{ sessionId: string; images: ImageInfo[] }[]> = await response.json();

  if (!result.success || !result.data) {
    throw new Error(result.error || 'Failed to get project images');
  }

  return result.data;
}

/**
 * ベースディレクトリ情報を取得
 */
export async function getFileApiInfo(): Promise<{ basePath: string }> {
  const response = await fetch(`${API_BASE_URL}/info`);

  if (!response.ok) {
    throw new Error(`HTTP error: ${response.status} ${response.statusText}`);
  }

  const result: ApiResponse<{ basePath: string }> = await response.json();

  if (!result.success || !result.data) {
    throw new Error(result.error || 'Failed to get info');
  }

  return result.data;
}

/**
 * サーバーの健全性をチェック
 */
export async function checkServerHealth(): Promise<boolean> {
  try {
    const response = await fetch('/api/health');
    const result = await response.json();
    return result.status === 'ok';
  } catch {
    return false;
  }
}
