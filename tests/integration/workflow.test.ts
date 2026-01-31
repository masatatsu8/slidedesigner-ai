/**
 * 統合テスト: ワークフロー全体のテスト
 *
 * ユーザーがプロジェクトを作成し、セッションを作成し、
 * 画像を保存するまでの一連のフローをテストする。
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll } from 'vitest';
import initSqlJs, { SqlJsStatic } from 'sql.js';
import path from 'path';
import { dbService } from '../../services/dbService';
import { userService } from '../../services/userService';
import { projectService } from '../../services/projectService';
import { sessionService } from '../../services/sessionService';
import { ComplexityLevel } from '../../types';

let sqlJs: SqlJsStatic;

beforeAll(async () => {
  sqlJs = await initSqlJs({
    locateFile: (file: string) => path.join(process.cwd(), 'node_modules', 'sql.js', 'dist', file),
  });
});

describe('Integration: Full Workflow', () => {
  beforeEach(async () => {
    await dbService.reset();
    await dbService.initialize(sqlJs);
    userService.clearCurrentUser();
  });

  afterEach(async () => {
    await dbService.reset();
    userService.clearCurrentUser();
  });

  it('should complete full workflow: user -> project -> session -> images', async () => {
    // 1. ユーザー初期化
    const user = await userService.initializeDefaultUser();
    expect(user.id).toBe('default-user-001');
    expect(userService.isInitialized()).toBe(true);

    // 2. プロジェクト作成
    const project = await projectService.createProject('マーケティング資料', 'Q4のキャンペーン用');
    expect(project.name).toBe('マーケティング資料');
    expect(project.ownerUserId).toBe(user.id);

    // 3. プロジェクト一覧確認
    const projects = await projectService.getProjectsForCurrentUser();
    expect(projects).toHaveLength(1);
    expect(projects[0].id).toBe(project.id);

    // 4. セッション作成
    const session = await sessionService.createSession({
      projectId: project.id,
      name: '新商品インフォグラフィック',
      inputText: '新商品Xの特徴を3つのポイントで説明',
      complexity: ComplexityLevel.LIGHT,
      resolution: '2K',
      designRequests: 'モダンなデザイン',
    });
    expect(session.name).toBe('新商品インフォグラフィック');
    expect(session.projectId).toBe(project.id);

    // 5. 画像保存(初期生成)
    const image1 = await sessionService.saveImage({
      sessionId: session.id,
      base64Data: 'base64-image-data-1',
      prompt: '新商品Xの特徴を3つのポイントで説明するインフォグラフィック',
      inputTokens: 500,
      outputTokens: 1000,
      estimatedCostUsd: 0.015,
      generationType: 'initial',
    });
    expect(image1.generationType).toBe('initial');
    expect(image1.sessionId).toBe(session.id);

    // 6. 画像保存(リファインメント)
    const image2 = await sessionService.saveImage({
      sessionId: session.id,
      base64Data: 'base64-image-data-2',
      prompt: '色をもっと鮮やかに',
      inputTokens: 600,
      outputTokens: 1100,
      estimatedCostUsd: 0.018,
      generationType: 'refinement',
      parentImageId: image1.id,
    });
    expect(image2.generationType).toBe('refinement');
    expect(image2.parentImageId).toBe(image1.id);

    // 7. 会話履歴保存
    await sessionService.addUserMessage(session.id, '色をもっと鮮やかにしてください');
    await sessionService.addAssistantMessage(session.id, '画像を更新しました', image2.id);

    const conversations = await sessionService.getConversations(session.id);
    expect(conversations).toHaveLength(2);
    expect(conversations[0].role).toBe('user');
    expect(conversations[1].role).toBe('assistant');

    // 8. セッション統計確認
    const stats = await sessionService.getSessionStats(session.id);
    expect(stats.imageCount).toBe(2);
    expect(stats.totalCost).toBeCloseTo(0.033);
    expect(stats.inputTokens).toBe(1100);
    expect(stats.outputTokens).toBe(2100);

    // 9. プロジェクト統計確認
    const projectStats = await projectService.getProjectStats(project.id);
    expect(projectStats.sessionCount).toBe(1);
    expect(projectStats.imageCount).toBe(2);

    // 10. 画像履歴確認(refinement chain)
    const history = await sessionService.getImageHistory(image2.id);
    expect(history).toHaveLength(2);
    expect(history[0].id).toBe(image1.id);
    expect(history[1].id).toBe(image2.id);

    // 11. プロジェクト内の全画像取得
    const allImages = await projectService.getAllImagesInProject(project.id);
    expect(allImages).toHaveLength(2);
  });

  it('should handle multiple projects and sessions', async () => {
    await userService.initializeDefaultUser();

    // 複数プロジェクト作成
    const project1 = await projectService.createProject('プロジェクト1');
    const project2 = await projectService.createProject('プロジェクト2');

    // 各プロジェクトに複数セッション作成
    await sessionService.createSession({ projectId: project1.id, name: 'セッション1-1' });
    await sessionService.createSession({ projectId: project1.id, name: 'セッション1-2' });
    await sessionService.createSession({ projectId: project2.id, name: 'セッション2-1' });

    // プロジェクト1のセッション確認
    const sessions1 = await projectService.getSessionsInProject(project1.id);
    expect(sessions1).toHaveLength(2);

    // プロジェクト2のセッション確認
    const sessions2 = await projectService.getSessionsInProject(project2.id);
    expect(sessions2).toHaveLength(1);
  });

  it('should cascade delete sessions when project is deleted', async () => {
    await userService.initializeDefaultUser();

    const project = await projectService.createProject('削除テスト');
    const session = await sessionService.createSession({
      projectId: project.id,
      name: 'セッション',
    });

    await sessionService.saveImage({
      sessionId: session.id,
      base64Data: 'test',
      prompt: 'test',
      inputTokens: 100,
      outputTokens: 200,
      estimatedCostUsd: 0.01,
      generationType: 'initial',
    });

    // プロジェクト削除前
    expect(await sessionService.getSession(session.id)).not.toBeNull();

    // プロジェクト削除
    await projectService.deleteProject(project.id);

    // カスケード削除確認
    expect(await sessionService.getSession(session.id)).toBeNull();
  });

  it('should persist and reload data', async () => {
    await userService.initializeDefaultUser();

    const project = await projectService.createProject('永続化テスト');
    const session = await sessionService.createSession({
      projectId: project.id,
      name: 'テストセッション',
    });

    await sessionService.saveImage({
      sessionId: session.id,
      base64Data: 'persistent-data',
      prompt: 'テストプロンプト',
      inputTokens: 100,
      outputTokens: 200,
      estimatedCostUsd: 0.01,
      generationType: 'initial',
    });

    // データベースをエクスポート
    const exportedData = await dbService.exportDatabase();
    expect(exportedData).toBeInstanceOf(Uint8Array);
    expect(exportedData.length).toBeGreaterThan(0);

    // データベースをリセット
    await dbService.reset();
    userService.clearCurrentUser();

    // データベースをインポート
    await dbService.initialize(sqlJs);
    await dbService.importDatabase(exportedData);

    // データが復元されていることを確認
    const restoredProject = await dbService.getProject(project.id);
    expect(restoredProject).not.toBeNull();
    expect(restoredProject?.name).toBe('永続化テスト');

    const restoredImages = await dbService.getImagesBySession(session.id);
    expect(restoredImages).toHaveLength(1);
    expect(restoredImages[0].base64Data).toBe('persistent-data');
  });
});

describe('Integration: User Settings', () => {
  beforeEach(async () => {
    await dbService.reset();
    await dbService.initialize(sqlJs);
    userService.clearCurrentUser();
  });

  afterEach(async () => {
    await dbService.reset();
    userService.clearCurrentUser();
  });

  it('should persist user settings', async () => {
    await userService.initializeDefaultUser();

    // 設定を更新
    await userService.updateSettings({ theme: 'dark', language: 'ja' });

    const user = userService.getCurrentUser();
    expect(user.settings.theme).toBe('dark');
    expect(user.settings.language).toBe('ja');

    // 再初期化しても設定が保持される
    userService.clearCurrentUser();
    const reloadedUser = await userService.initializeDefaultUser();
    expect(reloadedUser.settings.theme).toBe('dark');
    expect(reloadedUser.settings.language).toBe('ja');
  });
});

describe('Integration: Project Settings', () => {
  beforeEach(async () => {
    await dbService.reset();
    await dbService.initialize(sqlJs);
    userService.clearCurrentUser();
    await userService.initializeDefaultUser();
  });

  afterEach(async () => {
    await dbService.reset();
    userService.clearCurrentUser();
  });

  it('should persist project settings', async () => {
    const project = await projectService.createProject('設定テスト');

    await projectService.updateProjectSettings(project.id, {
      defaultComplexity: ComplexityLevel.SOLID,
      defaultResolution: '4K',
    });

    const updated = await projectService.getProject(project.id);
    expect(updated?.settings.defaultComplexity).toBe(ComplexityLevel.SOLID);
    expect(updated?.settings.defaultResolution).toBe('4K');
  });
});
