import { describe, it, expect, beforeEach, afterEach, beforeAll } from 'vitest';
import initSqlJs, { SqlJsStatic } from 'sql.js';
import path from 'path';
import { ComplexityLevel } from '../../types';
import { dbService } from '../../services/dbService';

// テスト用のsql.jsインスタンスを作成
let sqlJs: SqlJsStatic;

// グローバルセットアップ
beforeAll(async () => {
  // node_modulesからWASMファイルをロード
  sqlJs = await initSqlJs({
    locateFile: (file: string) => path.join(process.cwd(), 'node_modules', 'sql.js', 'dist', file),
  });
});

describe('dbService', () => {
  beforeEach(async () => {
    // 各テスト前にデータベースをリセット
    await dbService.reset();
    await dbService.initialize(sqlJs);
  });

  afterEach(async () => {
    await dbService.reset();
  });

  describe('initialize', () => {
    it('should initialize database successfully', async () => {
      // resetしてから再初期化
      await dbService.reset();
      await expect(dbService.initialize(sqlJs)).resolves.not.toThrow();
    });

    it('should be idempotent', async () => {
      await dbService.initialize(sqlJs);
      await expect(dbService.initialize(sqlJs)).resolves.not.toThrow();
    });
  });

  describe('users', () => {
    it('should create a new user', async () => {
      const user = await dbService.createUser({
        id: 'user-001',
        name: 'Test User',
        email: 'test@example.com',
      });

      expect(user.id).toBe('user-001');
      expect(user.name).toBe('Test User');
      expect(user.email).toBe('test@example.com');
      expect(user.createdAt).toBeDefined();
      expect(user.updatedAt).toBeDefined();
      expect(user.settings).toEqual({});
    });

    it('should retrieve an existing user', async () => {
      await dbService.createUser({
        id: 'user-002',
        name: 'Another User',
        email: 'another@example.com',
      });

      const user = await dbService.getUser('user-002');
      expect(user).not.toBeNull();
      expect(user?.name).toBe('Another User');
    });

    it('should return null for non-existent user', async () => {
      const user = await dbService.getUser('non-existent');
      expect(user).toBeNull();
    });

    it('should update user fields', async () => {
      await dbService.createUser({
        id: 'user-003',
        name: 'Original Name',
        email: 'original@example.com',
      });

      await dbService.updateUser('user-003', {
        name: 'Updated Name',
        settings: { theme: 'dark' },
      });

      const user = await dbService.getUser('user-003');
      expect(user?.name).toBe('Updated Name');
      expect(user?.settings.theme).toBe('dark');
    });
  });

  describe('projects', () => {
    const testUserId = 'test-user-001';

    beforeEach(async () => {
      await dbService.createUser({
        id: testUserId,
        name: 'Test User',
        email: 'test@example.com',
      });
    });

    it('should create a new project', async () => {
      const project = await dbService.createProject({
        ownerUserId: testUserId,
        name: 'Test Project',
        description: 'A test project',
      });

      expect(project.id).toBeDefined();
      expect(project.name).toBe('Test Project');
      expect(project.ownerUserId).toBe(testUserId);
      expect(project.description).toBe('A test project');
    });

    it('should retrieve all projects for a user', async () => {
      await dbService.createProject({
        ownerUserId: testUserId,
        name: 'Project 1',
        description: '',
      });
      await dbService.createProject({
        ownerUserId: testUserId,
        name: 'Project 2',
        description: '',
      });

      const projects = await dbService.getProjectsByUser(testUserId);
      expect(projects).toHaveLength(2);
    });

    it('should update project fields', async () => {
      const project = await dbService.createProject({
        ownerUserId: testUserId,
        name: 'Original',
        description: '',
      });

      await dbService.updateProject(project.id, {
        name: 'Updated',
        description: 'New description',
      });

      const updated = await dbService.getProject(project.id);
      expect(updated?.name).toBe('Updated');
      expect(updated?.description).toBe('New description');
    });

    it('should delete project', async () => {
      const project = await dbService.createProject({
        ownerUserId: testUserId,
        name: 'To Delete',
        description: '',
      });

      await dbService.deleteProject(project.id);

      const deleted = await dbService.getProject(project.id);
      expect(deleted).toBeNull();
    });
  });

  describe('sessions', () => {
    const testUserId = 'test-user-002';
    let testProjectId: string;

    beforeEach(async () => {
      await dbService.createUser({
        id: testUserId,
        name: 'Test User',
        email: 'test2@example.com',
      });

      const project = await dbService.createProject({
        ownerUserId: testUserId,
        name: 'Test Project',
        description: '',
      });
      testProjectId = project.id;
    });

    it('should create a new session', async () => {
      const session = await dbService.createSession({
        projectId: testProjectId,
        createdByUserId: testUserId,
        name: 'Test Session',
        inputText: 'テスト入力',
        complexity: ComplexityLevel.VERY_SIMPLE,
        resolution: '1K',
        designRequests: '',
        styleImageBase64: null,
      });

      expect(session.id).toBeDefined();
      expect(session.name).toBe('Test Session');
      expect(session.inputText).toBe('テスト入力');
    });

    it('should retrieve sessions by project', async () => {
      await dbService.createSession({
        projectId: testProjectId,
        createdByUserId: testUserId,
        name: 'Session 1',
        inputText: '',
        complexity: ComplexityLevel.VERY_SIMPLE,
        resolution: '1K',
        designRequests: '',
        styleImageBase64: null,
      });
      await dbService.createSession({
        projectId: testProjectId,
        createdByUserId: testUserId,
        name: 'Session 2',
        inputText: '',
        complexity: ComplexityLevel.LIGHT,
        resolution: '2K',
        designRequests: '',
        styleImageBase64: null,
      });

      const sessions = await dbService.getSessionsByProject(testProjectId);
      expect(sessions).toHaveLength(2);
    });

    it('should update session fields', async () => {
      const session = await dbService.createSession({
        projectId: testProjectId,
        createdByUserId: testUserId,
        name: 'Original Session',
        inputText: 'original',
        complexity: ComplexityLevel.VERY_SIMPLE,
        resolution: '1K',
        designRequests: '',
        styleImageBase64: null,
      });

      await dbService.updateSession(session.id, {
        name: 'Updated Session',
        inputText: 'updated',
      });

      const updated = await dbService.getSession(session.id);
      expect(updated?.name).toBe('Updated Session');
      expect(updated?.inputText).toBe('updated');
    });
  });

  describe('images', () => {
    const testUserId = 'test-user-003';
    let testSessionId: string;

    beforeEach(async () => {
      await dbService.createUser({
        id: testUserId,
        name: 'Test User',
        email: 'test3@example.com',
      });

      const project = await dbService.createProject({
        ownerUserId: testUserId,
        name: 'Test Project',
        description: '',
      });

      const session = await dbService.createSession({
        projectId: project.id,
        createdByUserId: testUserId,
        name: 'Test Session',
        inputText: '',
        complexity: ComplexityLevel.VERY_SIMPLE,
        resolution: '1K',
        designRequests: '',
        styleImageBase64: null,
      });
      testSessionId = session.id;
    });

    it('should save an image with token usage', async () => {
      const image = await dbService.saveImage({
        sessionId: testSessionId,
        base64Data: 'test-base64-data',
        prompt: 'Test prompt',
        inputTokens: 100,
        outputTokens: 200,
        estimatedCostUsd: 0.005,
        generationType: 'initial',
        parentImageId: null,
      });

      expect(image.id).toBeDefined();
      expect(image.base64Data).toBe('test-base64-data');
      expect(image.inputTokens).toBe(100);
      expect(image.outputTokens).toBe(200);
    });

    it('should retrieve images by session', async () => {
      await dbService.saveImage({
        sessionId: testSessionId,
        base64Data: 'data1',
        prompt: 'Prompt 1',
        inputTokens: 100,
        outputTokens: 200,
        estimatedCostUsd: 0.005,
        generationType: 'initial',
        parentImageId: null,
      });
      await dbService.saveImage({
        sessionId: testSessionId,
        base64Data: 'data2',
        prompt: 'Prompt 2',
        inputTokens: 150,
        outputTokens: 250,
        estimatedCostUsd: 0.006,
        generationType: 'initial',
        parentImageId: null,
      });

      const images = await dbService.getImagesBySession(testSessionId);
      expect(images).toHaveLength(2);
    });

    it('should track parent-child relationship for refinements', async () => {
      const parentImage = await dbService.saveImage({
        sessionId: testSessionId,
        base64Data: 'parent-data',
        prompt: 'Parent prompt',
        inputTokens: 100,
        outputTokens: 200,
        estimatedCostUsd: 0.005,
        generationType: 'initial',
        parentImageId: null,
      });

      const childImage = await dbService.saveImage({
        sessionId: testSessionId,
        base64Data: 'child-data',
        prompt: 'Child prompt',
        inputTokens: 120,
        outputTokens: 220,
        estimatedCostUsd: 0.006,
        generationType: 'refinement',
        parentImageId: parentImage.id,
      });

      expect(childImage.parentImageId).toBe(parentImage.id);
      expect(childImage.generationType).toBe('refinement');
    });
  });

  describe('conversations', () => {
    const testUserId = 'test-user-004';
    let testSessionId: string;

    beforeEach(async () => {
      await dbService.createUser({
        id: testUserId,
        name: 'Test User',
        email: 'test4@example.com',
      });

      const project = await dbService.createProject({
        ownerUserId: testUserId,
        name: 'Test Project',
        description: '',
      });

      const session = await dbService.createSession({
        projectId: project.id,
        createdByUserId: testUserId,
        name: 'Test Session',
        inputText: '',
        complexity: ComplexityLevel.VERY_SIMPLE,
        resolution: '1K',
        designRequests: '',
        styleImageBase64: null,
      });
      testSessionId = session.id;
    });

    it('should save a conversation', async () => {
      const conv = await dbService.saveConversation({
        sessionId: testSessionId,
        imageId: null,
        role: 'user',
        content: 'Test message',
        metadata: { key: 'value' },
      });

      expect(conv.id).toBeDefined();
      expect(conv.role).toBe('user');
      expect(conv.content).toBe('Test message');
    });

    it('should retrieve conversations by session', async () => {
      await dbService.saveConversation({
        sessionId: testSessionId,
        imageId: null,
        role: 'user',
        content: 'User message',
        metadata: {},
      });
      await dbService.saveConversation({
        sessionId: testSessionId,
        imageId: null,
        role: 'assistant',
        content: 'Assistant response',
        metadata: {},
      });

      const conversations = await dbService.getConversationsBySession(testSessionId);
      expect(conversations).toHaveLength(2);
      expect(conversations[0].role).toBe('user');
      expect(conversations[1].role).toBe('assistant');
    });
  });

  describe('statistics', () => {
    const testUserId = 'test-user-005';
    let testProjectId: string;
    let testSessionId: string;

    beforeEach(async () => {
      await dbService.createUser({
        id: testUserId,
        name: 'Test User',
        email: 'test5@example.com',
      });

      const project = await dbService.createProject({
        ownerUserId: testUserId,
        name: 'Test Project',
        description: '',
      });
      testProjectId = project.id;

      const session = await dbService.createSession({
        projectId: testProjectId,
        createdByUserId: testUserId,
        name: 'Test Session',
        inputText: '',
        complexity: ComplexityLevel.VERY_SIMPLE,
        resolution: '1K',
        designRequests: '',
        styleImageBase64: null,
      });
      testSessionId = session.id;
    });

    it('should count session images', async () => {
      await dbService.saveImage({
        sessionId: testSessionId,
        base64Data: 'data1',
        prompt: 'Prompt 1',
        inputTokens: 100,
        outputTokens: 200,
        estimatedCostUsd: 0.005,
        generationType: 'initial',
        parentImageId: null,
      });
      await dbService.saveImage({
        sessionId: testSessionId,
        base64Data: 'data2',
        prompt: 'Prompt 2',
        inputTokens: 100,
        outputTokens: 200,
        estimatedCostUsd: 0.005,
        generationType: 'initial',
        parentImageId: null,
      });

      const count = await dbService.getSessionImageCount(testSessionId);
      expect(count).toBe(2);
    });

    it('should count project sessions', async () => {
      await dbService.createSession({
        projectId: testProjectId,
        createdByUserId: testUserId,
        name: 'Session 2',
        inputText: '',
        complexity: ComplexityLevel.VERY_SIMPLE,
        resolution: '1K',
        designRequests: '',
        styleImageBase64: null,
      });

      const count = await dbService.getProjectSessionCount(testProjectId);
      expect(count).toBe(2); // 1 from beforeEach + 1 from this test
    });
  });
});
