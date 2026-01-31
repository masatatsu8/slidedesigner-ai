import { dbService } from './dbService';
import { userService } from './userService';
import type {
  Session,
  StoredImage,
  Conversation,
  ComplexityLevel,
  ImageResolution,
} from '../types';

interface CreateSessionParams {
  projectId: string;
  name: string;
  inputText?: string;
  complexity?: ComplexityLevel;
  resolution?: ImageResolution;
  designRequests?: string;
  styleImageBase64?: string | null;
}

interface SaveImageParams {
  sessionId: string;
  base64Data: string;
  prompt: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  generationType: 'initial' | 'refinement';
  parentImageId?: string | null;
}

interface SaveConversationParams {
  sessionId: string;
  imageId?: string | null;
  role: 'user' | 'assistant';
  content: string;
  metadata?: Record<string, unknown>;
}

class SessionService {
  /**
   * セッション作成
   */
  async createSession(params: CreateSessionParams): Promise<Session> {
    const user = userService.getCurrentUser();

    return await dbService.createSession({
      projectId: params.projectId,
      createdByUserId: user.id,
      name: params.name,
      inputText: params.inputText || '',
      complexity: params.complexity || 'VERY_SIMPLE' as ComplexityLevel,
      resolution: params.resolution || '1K',
      designRequests: params.designRequests || '',
      styleImageBase64: params.styleImageBase64 || null,
    });
  }

  /**
   * セッション取得
   */
  async getSession(id: string): Promise<Session | null> {
    return await dbService.getSession(id);
  }

  /**
   * セッション更新
   */
  async updateSession(
    id: string,
    updates: {
      name?: string;
      inputText?: string;
      complexity?: ComplexityLevel;
      resolution?: ImageResolution;
      designRequests?: string;
      styleImageBase64?: string | null;
    }
  ): Promise<Session> {
    await dbService.updateSession(id, updates);
    const updated = await dbService.getSession(id);
    if (!updated) {
      throw new Error(`Session not found: ${id}`);
    }
    return updated;
  }

  /**
   * セッション削除
   */
  async deleteSession(id: string): Promise<void> {
    await dbService.deleteSession(id);
  }

  /**
   * セッションの画像一覧取得
   */
  async getImages(sessionId: string): Promise<StoredImage[]> {
    return await dbService.getImagesBySession(sessionId);
  }

  /**
   * 画像保存
   */
  async saveImage(params: SaveImageParams): Promise<StoredImage> {
    return await dbService.saveImage({
      sessionId: params.sessionId,
      base64Data: params.base64Data,
      prompt: params.prompt,
      inputTokens: params.inputTokens,
      outputTokens: params.outputTokens,
      estimatedCostUsd: params.estimatedCostUsd,
      generationType: params.generationType,
      parentImageId: params.parentImageId || null,
    });
  }

  /**
   * 画像取得
   */
  async getImage(id: string): Promise<StoredImage | null> {
    return await dbService.getImage(id);
  }

  /**
   * 画像削除
   */
  async deleteImage(id: string): Promise<void> {
    await dbService.deleteImage(id);
  }

  /**
   * セッションの会話履歴取得
   */
  async getConversations(sessionId: string): Promise<Conversation[]> {
    return await dbService.getConversationsBySession(sessionId);
  }

  /**
   * 会話保存
   */
  async saveConversation(params: SaveConversationParams): Promise<Conversation> {
    return await dbService.saveConversation({
      sessionId: params.sessionId,
      imageId: params.imageId || null,
      role: params.role,
      content: params.content,
      metadata: params.metadata || {},
    });
  }

  /**
   * ユーザーメッセージを追加
   */
  async addUserMessage(
    sessionId: string,
    content: string,
    imageId?: string | null,
    metadata?: Record<string, unknown>
  ): Promise<Conversation> {
    return this.saveConversation({
      sessionId,
      imageId,
      role: 'user',
      content,
      metadata,
    });
  }

  /**
   * アシスタントメッセージを追加
   */
  async addAssistantMessage(
    sessionId: string,
    content: string,
    imageId?: string | null,
    metadata?: Record<string, unknown>
  ): Promise<Conversation> {
    return this.saveConversation({
      sessionId,
      imageId,
      role: 'assistant',
      content,
      metadata,
    });
  }

  /**
   * セッションの画像数を取得
   */
  async getImageCount(sessionId: string): Promise<number> {
    return await dbService.getSessionImageCount(sessionId);
  }

  /**
   * セッションの合計コストを計算
   */
  async getTotalCost(sessionId: string): Promise<number> {
    const images = await this.getImages(sessionId);
    return images.reduce((total, img) => total + img.estimatedCostUsd, 0);
  }

  /**
   * セッションの合計トークン数を計算
   */
  async getTotalTokens(sessionId: string): Promise<{
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  }> {
    const images = await this.getImages(sessionId);
    const inputTokens = images.reduce((total, img) => total + img.inputTokens, 0);
    const outputTokens = images.reduce((total, img) => total + img.outputTokens, 0);
    return {
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
    };
  }

  /**
   * セッションの統計情報を取得
   */
  async getSessionStats(sessionId: string): Promise<{
    imageCount: number;
    totalCost: number;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  }> {
    const images = await this.getImages(sessionId);

    const imageCount = images.length;
    const totalCost = images.reduce((total, img) => total + img.estimatedCostUsd, 0);
    const inputTokens = images.reduce((total, img) => total + img.inputTokens, 0);
    const outputTokens = images.reduce((total, img) => total + img.outputTokens, 0);

    return {
      imageCount,
      totalCost,
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
    };
  }

  /**
   * 画像の親子関係を取得(refinement履歴)
   */
  async getImageHistory(imageId: string): Promise<StoredImage[]> {
    const history: StoredImage[] = [];
    let currentImage = await this.getImage(imageId);

    while (currentImage) {
      history.unshift(currentImage);
      if (currentImage.parentImageId) {
        currentImage = await this.getImage(currentImage.parentImageId);
      } else {
        break;
      }
    }

    return history;
  }

  /**
   * 画像の派生(子)画像を取得
   */
  async getImageRefinements(imageId: string): Promise<StoredImage[]> {
    const image = await this.getImage(imageId);
    if (!image) {
      return [];
    }

    const allImages = await this.getImages(image.sessionId);
    return allImages.filter((img) => img.parentImageId === imageId);
  }
}

// シングルトンインスタンスをエクスポート
export const sessionService = new SessionService();
