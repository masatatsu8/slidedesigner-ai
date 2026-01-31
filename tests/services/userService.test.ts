import { describe, it, expect, beforeEach, afterEach, beforeAll } from 'vitest';
import initSqlJs, { SqlJsStatic } from 'sql.js';
import path from 'path';
import { dbService } from '../../services/dbService';
import { userService } from '../../services/userService';

// テスト用のsql.jsインスタンスを作成
let sqlJs: SqlJsStatic;

beforeAll(async () => {
  sqlJs = await initSqlJs({
    locateFile: (file: string) => path.join(process.cwd(), 'node_modules', 'sql.js', 'dist', file),
  });
});

describe('userService', () => {
  beforeEach(async () => {
    await dbService.reset();
    await dbService.initialize(sqlJs);
    userService.clearCurrentUser();
  });

  afterEach(async () => {
    await dbService.reset();
    userService.clearCurrentUser();
  });

  describe('initializeDefaultUser', () => {
    it('should create a new default user if not exists', async () => {
      const user = await userService.initializeDefaultUser();

      expect(user.id).toBe('default-user-001');
      expect(user.name).toBe('Default User');
      expect(user.email).toBe('user@example.com');
    });

    it('should return existing user if already exists', async () => {
      // 最初の初期化
      const firstUser = await userService.initializeDefaultUser();
      const firstCreatedAt = firstUser.createdAt;

      // ユーザーをクリアして再初期化
      userService.clearCurrentUser();
      const secondUser = await userService.initializeDefaultUser();

      // createdAtが同じなら既存ユーザーを取得している
      expect(secondUser.createdAt).toBe(firstCreatedAt);
    });
  });

  describe('getCurrentUser', () => {
    it('should return current user after initialization', async () => {
      await userService.initializeDefaultUser();
      const user = userService.getCurrentUser();

      expect(user.id).toBe('default-user-001');
    });

    it('should throw error if not initialized', () => {
      expect(() => userService.getCurrentUser()).toThrow('User not initialized');
    });
  });

  describe('isInitialized', () => {
    it('should return false before initialization', () => {
      expect(userService.isInitialized()).toBe(false);
    });

    it('should return true after initialization', async () => {
      await userService.initializeDefaultUser();
      expect(userService.isInitialized()).toBe(true);
    });
  });

  describe('updateCurrentUser', () => {
    it('should update user name', async () => {
      await userService.initializeDefaultUser();

      const updated = await userService.updateCurrentUser({ name: 'New Name' });

      expect(updated.name).toBe('New Name');
      expect(userService.getCurrentUser().name).toBe('New Name');
    });

    it('should throw error if not initialized', async () => {
      await expect(userService.updateCurrentUser({ name: 'Test' })).rejects.toThrow('User not initialized');
    });
  });

  describe('updateSettings', () => {
    it('should update user settings', async () => {
      await userService.initializeDefaultUser();

      const updated = await userService.updateSettings({ theme: 'dark' });

      expect(updated.settings.theme).toBe('dark');
    });

    it('should merge settings without overwriting existing', async () => {
      await userService.initializeDefaultUser();

      await userService.updateSettings({ theme: 'dark' });
      const updated = await userService.updateSettings({ language: 'ja' });

      expect(updated.settings.theme).toBe('dark');
      expect(updated.settings.language).toBe('ja');
    });
  });

  describe('switchUser', () => {
    it('should switch to existing user', async () => {
      // 別のユーザーを作成
      await dbService.createUser({
        id: 'other-user',
        name: 'Other User',
        email: 'other@example.com',
      });

      // デフォルトユーザーを初期化
      await userService.initializeDefaultUser();

      // 別のユーザーに切り替え
      const otherUser = await userService.switchUser('other-user');

      expect(otherUser.id).toBe('other-user');
      expect(userService.getCurrentUser().id).toBe('other-user');
    });

    it('should throw error for non-existent user', async () => {
      await userService.initializeDefaultUser();

      await expect(userService.switchUser('non-existent')).rejects.toThrow('User not found');
    });
  });
});
