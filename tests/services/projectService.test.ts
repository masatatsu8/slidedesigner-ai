import { describe, it, expect, beforeEach, afterEach, beforeAll } from 'vitest';
import initSqlJs, { SqlJsStatic } from 'sql.js';
import path from 'path';
import { dbService } from '../../services/dbService';
import { userService } from '../../services/userService';
import { projectService } from '../../services/projectService';
import { ComplexityLevel } from '../../types';

// テスト用のsql.jsインスタンスを作成
let sqlJs: SqlJsStatic;

beforeAll(async () => {
  sqlJs = await initSqlJs({
    locateFile: (file: string) => path.join(process.cwd(), 'node_modules', 'sql.js', 'dist', file),
  });
});

describe('projectService', () => {
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

  describe('createProject', () => {
    it('should create a new project with name only', async () => {
      const project = await projectService.createProject('Test Project');

      expect(project.name).toBe('Test Project');
      expect(project.description).toBe('');
      expect(project.ownerUserId).toBe('default-user-001');
    });

    it('should create a new project with name and description', async () => {
      const project = await projectService.createProject('Test Project', 'A description');

      expect(project.name).toBe('Test Project');
      expect(project.description).toBe('A description');
    });
  });

  describe('getProject', () => {
    it('should retrieve an existing project', async () => {
      const created = await projectService.createProject('Test');
      const retrieved = await projectService.getProject(created.id);

      expect(retrieved).not.toBeNull();
      expect(retrieved?.name).toBe('Test');
    });

    it('should return null for non-existent project', async () => {
      const project = await projectService.getProject('non-existent');

      expect(project).toBeNull();
    });
  });

  describe('getProjectsForCurrentUser', () => {
    it('should return all projects for current user', async () => {
      await projectService.createProject('Project 1');
      await projectService.createProject('Project 2');
      await projectService.createProject('Project 3');

      const projects = await projectService.getProjectsForCurrentUser();

      expect(projects).toHaveLength(3);
    });

    it('should return empty array if no projects', async () => {
      const projects = await projectService.getProjectsForCurrentUser();

      expect(projects).toHaveLength(0);
    });

    it('should return projects sorted by updatedAt desc', async () => {
      const p1 = await projectService.createProject('Project 1');
      await projectService.createProject('Project 2');

      // p1を更新して最新にする
      await projectService.updateProject(p1.id, { name: 'Project 1 Updated' });

      const projects = await projectService.getProjectsForCurrentUser();

      expect(projects[0].name).toBe('Project 1 Updated');
    });
  });

  describe('updateProject', () => {
    it('should update project name', async () => {
      const project = await projectService.createProject('Original');
      const updated = await projectService.updateProject(project.id, { name: 'Updated' });

      expect(updated.name).toBe('Updated');
    });

    it('should update project description', async () => {
      const project = await projectService.createProject('Test');
      const updated = await projectService.updateProject(project.id, { description: 'New desc' });

      expect(updated.description).toBe('New desc');
    });

    it('should throw error for non-existent project', async () => {
      await expect(
        projectService.updateProject('non-existent', { name: 'Test' })
      ).rejects.toThrow('Project not found');
    });
  });

  describe('updateProjectSettings', () => {
    it('should update project settings', async () => {
      const project = await projectService.createProject('Test');
      const updated = await projectService.updateProjectSettings(project.id, {
        defaultComplexity: ComplexityLevel.SOLID,
      });

      expect(updated.settings.defaultComplexity).toBe(ComplexityLevel.SOLID);
    });

    it('should merge settings without overwriting existing', async () => {
      const project = await projectService.createProject('Test');

      await projectService.updateProjectSettings(project.id, {
        defaultComplexity: ComplexityLevel.SOLID,
      });
      const updated = await projectService.updateProjectSettings(project.id, {
        defaultResolution: '2K',
      });

      expect(updated.settings.defaultComplexity).toBe(ComplexityLevel.SOLID);
      expect(updated.settings.defaultResolution).toBe('2K');
    });
  });

  describe('deleteProject', () => {
    it('should delete an existing project', async () => {
      const project = await projectService.createProject('To Delete');
      await projectService.deleteProject(project.id);

      const deleted = await projectService.getProject(project.id);
      expect(deleted).toBeNull();
    });
  });

  describe('getSessionsInProject', () => {
    it('should return all sessions in project', async () => {
      const project = await projectService.createProject('Test');
      const user = userService.getCurrentUser();

      await dbService.createSession({
        projectId: project.id,
        createdByUserId: user.id,
        name: 'Session 1',
        inputText: '',
        complexity: ComplexityLevel.VERY_SIMPLE,
        resolution: '1K',
        designRequests: '',
        styleImageBase64: null,
      });
      await dbService.createSession({
        projectId: project.id,
        createdByUserId: user.id,
        name: 'Session 2',
        inputText: '',
        complexity: ComplexityLevel.VERY_SIMPLE,
        resolution: '1K',
        designRequests: '',
        styleImageBase64: null,
      });

      const sessions = await projectService.getSessionsInProject(project.id);

      expect(sessions).toHaveLength(2);
    });
  });

  describe('getAllImagesInProject', () => {
    it('should return all images across all sessions', async () => {
      const project = await projectService.createProject('Test');
      const user = userService.getCurrentUser();

      const session1 = await dbService.createSession({
        projectId: project.id,
        createdByUserId: user.id,
        name: 'Session 1',
        inputText: '',
        complexity: ComplexityLevel.VERY_SIMPLE,
        resolution: '1K',
        designRequests: '',
        styleImageBase64: null,
      });
      const session2 = await dbService.createSession({
        projectId: project.id,
        createdByUserId: user.id,
        name: 'Session 2',
        inputText: '',
        complexity: ComplexityLevel.VERY_SIMPLE,
        resolution: '1K',
        designRequests: '',
        styleImageBase64: null,
      });

      await dbService.saveImage({
        sessionId: session1.id,
        base64Data: 'data1',
        prompt: 'prompt1',
        inputTokens: 100,
        outputTokens: 200,
        estimatedCostUsd: 0.01,
        generationType: 'initial',
        parentImageId: null,
      });
      await dbService.saveImage({
        sessionId: session2.id,
        base64Data: 'data2',
        prompt: 'prompt2',
        inputTokens: 100,
        outputTokens: 200,
        estimatedCostUsd: 0.01,
        generationType: 'initial',
        parentImageId: null,
      });

      const images = await projectService.getAllImagesInProject(project.id);

      expect(images).toHaveLength(2);
    });
  });

  describe('getProjectStats', () => {
    it('should return correct session and image counts', async () => {
      const project = await projectService.createProject('Test');
      const user = userService.getCurrentUser();

      const session = await dbService.createSession({
        projectId: project.id,
        createdByUserId: user.id,
        name: 'Session 1',
        inputText: '',
        complexity: ComplexityLevel.VERY_SIMPLE,
        resolution: '1K',
        designRequests: '',
        styleImageBase64: null,
      });

      await dbService.saveImage({
        sessionId: session.id,
        base64Data: 'data1',
        prompt: 'prompt1',
        inputTokens: 100,
        outputTokens: 200,
        estimatedCostUsd: 0.01,
        generationType: 'initial',
        parentImageId: null,
      });
      await dbService.saveImage({
        sessionId: session.id,
        base64Data: 'data2',
        prompt: 'prompt2',
        inputTokens: 100,
        outputTokens: 200,
        estimatedCostUsd: 0.01,
        generationType: 'initial',
        parentImageId: null,
      });

      const stats = await projectService.getProjectStats(project.id);

      expect(stats.sessionCount).toBe(1);
      expect(stats.imageCount).toBe(2);
    });
  });
});
