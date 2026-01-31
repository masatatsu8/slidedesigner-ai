import { dbService } from './dbService';
import type { User, UserSettings } from '../types';

// デフォルトユーザー設定(環境変数から取得、またはデフォルト値を使用)
const DEFAULT_USER = {
  id: (typeof process !== 'undefined' && process.env?.DEFAULT_USER_ID) || 'default-user-001',
  name: (typeof process !== 'undefined' && process.env?.DEFAULT_USER_NAME) || 'Default User',
  email: (typeof process !== 'undefined' && process.env?.DEFAULT_USER_EMAIL) || 'user@example.com',
};

class UserService {
  private currentUser: User | null = null;

  /**
   * アプリ起動時にデフォルトユーザーを初期化
   * ユーザーが存在しない場合は作成
   */
  async initializeDefaultUser(): Promise<User> {
    let user = await dbService.getUser(DEFAULT_USER.id);

    if (!user) {
      user = await dbService.createUser({
        id: DEFAULT_USER.id,
        name: DEFAULT_USER.name,
        email: DEFAULT_USER.email,
      });
    }

    this.currentUser = user;
    return user;
  }

  /**
   * 現在のユーザーを取得
   * @throws ユーザーが初期化されていない場合
   */
  getCurrentUser(): User {
    if (!this.currentUser) {
      throw new Error('User not initialized. Call initializeDefaultUser first.');
    }
    return this.currentUser;
  }

  /**
   * 現在のユーザーが初期化されているか確認
   */
  isInitialized(): boolean {
    return this.currentUser !== null;
  }

  /**
   * 現在のユーザーを更新
   */
  async updateCurrentUser(updates: Partial<Omit<User, 'id' | 'createdAt'>>): Promise<User> {
    if (!this.currentUser) {
      throw new Error('User not initialized. Call initializeDefaultUser first.');
    }

    await dbService.updateUser(this.currentUser.id, updates);
    const updatedUser = await dbService.getUser(this.currentUser.id);

    if (!updatedUser) {
      throw new Error('Failed to retrieve updated user');
    }

    this.currentUser = updatedUser;
    return updatedUser;
  }

  /**
   * ユーザー設定を更新
   */
  async updateSettings(settings: Partial<UserSettings>): Promise<User> {
    if (!this.currentUser) {
      throw new Error('User not initialized. Call initializeDefaultUser first.');
    }

    const newSettings = {
      ...this.currentUser.settings,
      ...settings,
    };

    return this.updateCurrentUser({ settings: newSettings });
  }

  /**
   * 将来のマルチユーザー対応: ユーザー切り替え
   */
  async switchUser(userId: string): Promise<User> {
    const user = await dbService.getUser(userId);
    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }
    this.currentUser = user;
    return user;
  }

  /**
   * 現在のユーザーをクリア(主にテスト用)
   */
  clearCurrentUser(): void {
    this.currentUser = null;
  }
}

// シングルトンインスタンスをエクスポート
export const userService = new UserService();
