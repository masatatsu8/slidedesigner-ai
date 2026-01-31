import { dbService } from './dbService';
import { userService } from './userService';
import type { Project, ProjectSettings, Session, StoredImage } from '../types';

class ProjectService {
  /**
   * プロジェクト作成
   */
  async createProject(name: string, description?: string): Promise<Project> {
    const user = userService.getCurrentUser();
    return await dbService.createProject({
      ownerUserId: user.id,
      name,
      description: description || '',
    });
  }

  /**
   * プロジェクト取得
   */
  async getProject(id: string): Promise<Project | null> {
    return await dbService.getProject(id);
  }

  /**
   * ユーザーのプロジェクト一覧取得
   */
  async getProjectsForCurrentUser(): Promise<Project[]> {
    const user = userService.getCurrentUser();
    return await dbService.getProjectsByUser(user.id);
  }

  /**
   * プロジェクト更新
   */
  async updateProject(
    id: string,
    updates: { name?: string; description?: string; settings?: ProjectSettings }
  ): Promise<Project> {
    await dbService.updateProject(id, updates);
    const updated = await dbService.getProject(id);
    if (!updated) {
      throw new Error(`Project not found: ${id}`);
    }
    return updated;
  }

  /**
   * プロジェクト設定のみ更新
   */
  async updateProjectSettings(id: string, settings: Partial<ProjectSettings>): Promise<Project> {
    const project = await dbService.getProject(id);
    if (!project) {
      throw new Error(`Project not found: ${id}`);
    }

    const newSettings = {
      ...project.settings,
      ...settings,
    };

    return this.updateProject(id, { settings: newSettings });
  }

  /**
   * プロジェクト削除
   */
  async deleteProject(id: string): Promise<void> {
    await dbService.deleteProject(id);
  }

  /**
   * プロジェクト内のセッション一覧取得
   */
  async getSessionsInProject(projectId: string): Promise<Session[]> {
    return await dbService.getSessionsByProject(projectId);
  }

  /**
   * プロジェクト内の全画像取得(オーサリング用)
   */
  async getAllImagesInProject(projectId: string): Promise<StoredImage[]> {
    const sessions = await this.getSessionsInProject(projectId);
    const imageArrays = await Promise.all(
      sessions.map((s) => dbService.getImagesBySession(s.id))
    );
    return imageArrays.flat();
  }

  /**
   * プロジェクトのセッション数を取得
   */
  async getSessionCount(projectId: string): Promise<number> {
    return await dbService.getProjectSessionCount(projectId);
  }

  /**
   * プロジェクトの画像数を取得
   */
  async getImageCount(projectId: string): Promise<number> {
    return await dbService.getProjectImageCount(projectId);
  }

  /**
   * プロジェクトの統計情報を取得
   */
  async getProjectStats(projectId: string): Promise<{
    sessionCount: number;
    imageCount: number;
  }> {
    const [sessionCount, imageCount] = await Promise.all([
      this.getSessionCount(projectId),
      this.getImageCount(projectId),
    ]);
    return { sessionCount, imageCount };
  }
}

// シングルトンインスタンスをエクスポート
export const projectService = new ProjectService();
