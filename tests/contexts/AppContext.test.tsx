import { describe, it, expect, beforeEach, afterEach, beforeAll, vi } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import initSqlJs, { SqlJsStatic } from 'sql.js';
import path from 'path';
import React from 'react';
import { AppProvider, useApp, useCurrentUser, useProjects } from '../../contexts/AppContext';
import { dbService } from '../../services/dbService';
import { userService } from '../../services/userService';

// テスト用のsql.jsインスタンスを作成
let sqlJs: SqlJsStatic;

beforeAll(async () => {
  sqlJs = await initSqlJs({
    locateFile: (file: string) => path.join(process.cwd(), 'node_modules', 'sql.js', 'dist', file),
  });
});

// テスト用コンポーネント
function TestComponent() {
  const { state, createProject, deleteProject } = useApp();
  const currentUser = useCurrentUser();
  const projects = useProjects();

  return (
    <div>
      <div data-testid="loading">{state.isLoading ? 'loading' : 'loaded'}</div>
      <div data-testid="initialized">{state.isInitialized ? 'yes' : 'no'}</div>
      <div data-testid="user">{currentUser?.name || 'no user'}</div>
      <div data-testid="project-count">{projects.length}</div>
      <div data-testid="error">{state.error || 'no error'}</div>
      <button
        data-testid="create-project"
        onClick={() => createProject('Test Project', 'Description')}
      >
        Create Project
      </button>
      {projects.length > 0 && (
        <button
          data-testid="delete-project"
          onClick={() => deleteProject(projects[0].id)}
        >
          Delete Project
        </button>
      )}
    </div>
  );
}

describe('AppContext', () => {
  beforeEach(async () => {
    await dbService.reset();
    await dbService.initialize(sqlJs);
    userService.clearCurrentUser();
  });

  afterEach(async () => {
    await dbService.reset();
    userService.clearCurrentUser();
  });

  it('should initialize app on mount', async () => {
    render(
      <AppProvider>
        <TestComponent />
      </AppProvider>
    );

    // 初期状態はloading
    expect(screen.getByTestId('loading')).toHaveTextContent('loading');

    // 初期化完了を待つ
    await waitFor(() => {
      expect(screen.getByTestId('initialized')).toHaveTextContent('yes');
    });

    expect(screen.getByTestId('loading')).toHaveTextContent('loaded');
    expect(screen.getByTestId('user')).toHaveTextContent('Default User');
  });

  it('should create a project', async () => {
    const user = userEvent.setup();

    render(
      <AppProvider>
        <TestComponent />
      </AppProvider>
    );

    // 初期化完了を待つ
    await waitFor(() => {
      expect(screen.getByTestId('initialized')).toHaveTextContent('yes');
    });

    expect(screen.getByTestId('project-count')).toHaveTextContent('0');

    // プロジェクト作成
    await user.click(screen.getByTestId('create-project'));

    await waitFor(() => {
      expect(screen.getByTestId('project-count')).toHaveTextContent('1');
    });
  });

  it('should delete a project', async () => {
    const user = userEvent.setup();

    render(
      <AppProvider>
        <TestComponent />
      </AppProvider>
    );

    // 初期化完了を待つ
    await waitFor(() => {
      expect(screen.getByTestId('initialized')).toHaveTextContent('yes');
    });

    // プロジェクト作成
    await user.click(screen.getByTestId('create-project'));

    await waitFor(() => {
      expect(screen.getByTestId('project-count')).toHaveTextContent('1');
    });

    // プロジェクト削除
    await user.click(screen.getByTestId('delete-project'));

    await waitFor(() => {
      expect(screen.getByTestId('project-count')).toHaveTextContent('0');
    });
  });
});
