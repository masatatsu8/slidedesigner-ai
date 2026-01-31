import { describe, it, expect, beforeEach, afterEach, beforeAll } from 'vitest';
import initSqlJs, { SqlJsStatic } from 'sql.js';
import path from 'path';
import { dbService } from '../../services/dbService';
import { userService } from '../../services/userService';
import { projectService } from '../../services/projectService';
import { sessionService } from '../../services/sessionService';
import { ComplexityLevel } from '../../types';

// テスト用のsql.jsインスタンスを作成
let sqlJs: SqlJsStatic;
let testProjectId: string;

beforeAll(async () => {
  sqlJs = await initSqlJs({
    locateFile: (file: string) => path.join(process.cwd(), 'node_modules', 'sql.js', 'dist', file),
  });
});

describe('sessionService', () => {
  beforeEach(async () => {
    await dbService.reset();
    await dbService.initialize(sqlJs);
    userService.clearCurrentUser();
    await userService.initializeDefaultUser();

    // テスト用プロジェクトを作成
    const project = await projectService.createProject('Test Project');
    testProjectId = project.id;
  });

  afterEach(async () => {
    await dbService.reset();
    userService.clearCurrentUser();
  });

  describe('createSession', () => {
    it('should create a new session with minimal params', async () => {
      const session = await sessionService.createSession({
        projectId: testProjectId,
        name: 'Test Session',
      });

      expect(session.name).toBe('Test Session');
      expect(session.projectId).toBe(testProjectId);
      expect(session.complexity).toBe('VERY_SIMPLE');
      expect(session.resolution).toBe('1K');
    });

    it('should create a new session with full params', async () => {
      const session = await sessionService.createSession({
        projectId: testProjectId,
        name: 'Full Session',
        inputText: 'Test input',
        complexity: ComplexityLevel.SOLID,
        resolution: '4K',
        designRequests: 'Make it cool',
        styleImageBase64: 'base64data',
      });

      expect(session.inputText).toBe('Test input');
      expect(session.complexity).toBe(ComplexityLevel.SOLID);
      expect(session.resolution).toBe('4K');
      expect(session.designRequests).toBe('Make it cool');
      expect(session.styleImageBase64).toBe('base64data');
    });
  });

  describe('getSession and updateSession', () => {
    it('should retrieve a session', async () => {
      const created = await sessionService.createSession({
        projectId: testProjectId,
        name: 'Test',
      });

      const retrieved = await sessionService.getSession(created.id);

      expect(retrieved).not.toBeNull();
      expect(retrieved?.name).toBe('Test');
    });

    it('should update session', async () => {
      const session = await sessionService.createSession({
        projectId: testProjectId,
        name: 'Original',
      });

      const updated = await sessionService.updateSession(session.id, {
        name: 'Updated',
        inputText: 'New input',
      });

      expect(updated.name).toBe('Updated');
      expect(updated.inputText).toBe('New input');
    });
  });

  describe('deleteSession', () => {
    it('should delete a session', async () => {
      const session = await sessionService.createSession({
        projectId: testProjectId,
        name: 'To Delete',
      });

      await sessionService.deleteSession(session.id);

      const deleted = await sessionService.getSession(session.id);
      expect(deleted).toBeNull();
    });
  });

  describe('images', () => {
    let testSessionId: string;

    beforeEach(async () => {
      const session = await sessionService.createSession({
        projectId: testProjectId,
        name: 'Image Test Session',
      });
      testSessionId = session.id;
    });

    it('should save an image', async () => {
      const image = await sessionService.saveImage({
        sessionId: testSessionId,
        base64Data: 'test-base64',
        prompt: 'Test prompt',
        inputTokens: 100,
        outputTokens: 200,
        estimatedCostUsd: 0.01,
        generationType: 'initial',
      });

      expect(image.id).toBeDefined();
      expect(image.base64Data).toBe('test-base64');
      expect(image.generationType).toBe('initial');
    });

    it('should get images by session', async () => {
      await sessionService.saveImage({
        sessionId: testSessionId,
        base64Data: 'data1',
        prompt: 'Prompt 1',
        inputTokens: 100,
        outputTokens: 200,
        estimatedCostUsd: 0.01,
        generationType: 'initial',
      });
      await sessionService.saveImage({
        sessionId: testSessionId,
        base64Data: 'data2',
        prompt: 'Prompt 2',
        inputTokens: 150,
        outputTokens: 250,
        estimatedCostUsd: 0.02,
        generationType: 'initial',
      });

      const images = await sessionService.getImages(testSessionId);

      expect(images).toHaveLength(2);
    });

    it('should delete an image', async () => {
      const image = await sessionService.saveImage({
        sessionId: testSessionId,
        base64Data: 'test',
        prompt: 'Test',
        inputTokens: 100,
        outputTokens: 200,
        estimatedCostUsd: 0.01,
        generationType: 'initial',
      });

      await sessionService.deleteImage(image.id);

      const deleted = await sessionService.getImage(image.id);
      expect(deleted).toBeNull();
    });

    it('should track refinement history', async () => {
      const parent = await sessionService.saveImage({
        sessionId: testSessionId,
        base64Data: 'parent',
        prompt: 'Parent',
        inputTokens: 100,
        outputTokens: 200,
        estimatedCostUsd: 0.01,
        generationType: 'initial',
      });

      const child = await sessionService.saveImage({
        sessionId: testSessionId,
        base64Data: 'child',
        prompt: 'Child',
        inputTokens: 120,
        outputTokens: 220,
        estimatedCostUsd: 0.02,
        generationType: 'refinement',
        parentImageId: parent.id,
      });

      const history = await sessionService.getImageHistory(child.id);

      expect(history).toHaveLength(2);
      expect(history[0].id).toBe(parent.id);
      expect(history[1].id).toBe(child.id);
    });

    it('should get image refinements', async () => {
      const parent = await sessionService.saveImage({
        sessionId: testSessionId,
        base64Data: 'parent',
        prompt: 'Parent',
        inputTokens: 100,
        outputTokens: 200,
        estimatedCostUsd: 0.01,
        generationType: 'initial',
      });

      await sessionService.saveImage({
        sessionId: testSessionId,
        base64Data: 'child1',
        prompt: 'Child 1',
        inputTokens: 120,
        outputTokens: 220,
        estimatedCostUsd: 0.02,
        generationType: 'refinement',
        parentImageId: parent.id,
      });

      await sessionService.saveImage({
        sessionId: testSessionId,
        base64Data: 'child2',
        prompt: 'Child 2',
        inputTokens: 130,
        outputTokens: 230,
        estimatedCostUsd: 0.025,
        generationType: 'refinement',
        parentImageId: parent.id,
      });

      const refinements = await sessionService.getImageRefinements(parent.id);

      expect(refinements).toHaveLength(2);
    });
  });

  describe('conversations', () => {
    let testSessionId: string;

    beforeEach(async () => {
      const session = await sessionService.createSession({
        projectId: testProjectId,
        name: 'Conversation Test Session',
      });
      testSessionId = session.id;
    });

    it('should save a conversation', async () => {
      const conv = await sessionService.saveConversation({
        sessionId: testSessionId,
        role: 'user',
        content: 'Hello',
      });

      expect(conv.id).toBeDefined();
      expect(conv.role).toBe('user');
      expect(conv.content).toBe('Hello');
    });

    it('should get conversations by session', async () => {
      await sessionService.addUserMessage(testSessionId, 'Hello');
      await sessionService.addAssistantMessage(testSessionId, 'Hi there');

      const conversations = await sessionService.getConversations(testSessionId);

      expect(conversations).toHaveLength(2);
      expect(conversations[0].role).toBe('user');
      expect(conversations[1].role).toBe('assistant');
    });

    it('should add user message', async () => {
      const conv = await sessionService.addUserMessage(testSessionId, 'User message');

      expect(conv.role).toBe('user');
      expect(conv.content).toBe('User message');
    });

    it('should add assistant message', async () => {
      const conv = await sessionService.addAssistantMessage(testSessionId, 'Assistant message');

      expect(conv.role).toBe('assistant');
      expect(conv.content).toBe('Assistant message');
    });
  });

  describe('statistics', () => {
    let testSessionId: string;

    beforeEach(async () => {
      const session = await sessionService.createSession({
        projectId: testProjectId,
        name: 'Stats Test Session',
      });
      testSessionId = session.id;

      await sessionService.saveImage({
        sessionId: testSessionId,
        base64Data: 'data1',
        prompt: 'Prompt 1',
        inputTokens: 100,
        outputTokens: 200,
        estimatedCostUsd: 0.01,
        generationType: 'initial',
      });
      await sessionService.saveImage({
        sessionId: testSessionId,
        base64Data: 'data2',
        prompt: 'Prompt 2',
        inputTokens: 150,
        outputTokens: 250,
        estimatedCostUsd: 0.02,
        generationType: 'initial',
      });
    });

    it('should get image count', async () => {
      const count = await sessionService.getImageCount(testSessionId);
      expect(count).toBe(2);
    });

    it('should get total cost', async () => {
      const cost = await sessionService.getTotalCost(testSessionId);
      expect(cost).toBeCloseTo(0.03);
    });

    it('should get total tokens', async () => {
      const tokens = await sessionService.getTotalTokens(testSessionId);

      expect(tokens.inputTokens).toBe(250);
      expect(tokens.outputTokens).toBe(450);
      expect(tokens.totalTokens).toBe(700);
    });

    it('should get session stats', async () => {
      const stats = await sessionService.getSessionStats(testSessionId);

      expect(stats.imageCount).toBe(2);
      expect(stats.totalCost).toBeCloseTo(0.03);
      expect(stats.inputTokens).toBe(250);
      expect(stats.outputTokens).toBe(450);
      expect(stats.totalTokens).toBe(700);
    });
  });
});
