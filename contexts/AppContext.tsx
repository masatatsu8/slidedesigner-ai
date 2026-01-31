import React, {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useCallback,
  ReactNode,
} from 'react';
import { dbService } from '../services/dbService';
import { userService } from '../services/userService';
import { projectService } from '../services/projectService';
import type { User, Project, ViewMode } from '../types';

// ============================================
// State & Actions
// ============================================

interface AppState {
  // ユーザー関連
  currentUser: User | null;
  isUserInitialized: boolean;

  // プロジェクト関連
  projects: Project[];
  currentProject: Project | null;

  // ビューモード
  viewMode: ViewMode;

  // グローバル状態
  isLoading: boolean;
  isInitialized: boolean;
  error: string | null;
}

type AppAction =
  | { type: 'SET_USER'; payload: User }
  | { type: 'SET_PROJECTS'; payload: Project[] }
  | { type: 'SET_CURRENT_PROJECT'; payload: Project | null }
  | { type: 'ADD_PROJECT'; payload: Project }
  | { type: 'UPDATE_PROJECT'; payload: { id: string; updates: Partial<Project> } }
  | { type: 'DELETE_PROJECT'; payload: string }
  | { type: 'SET_VIEW_MODE'; payload: ViewMode }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_INITIALIZED'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null };

const initialState: AppState = {
  currentUser: null,
  isUserInitialized: false,
  projects: [],
  currentProject: null,
  viewMode: 'PROJECT_LIST' as ViewMode,
  isLoading: true,
  isInitialized: false,
  error: null,
};

// ============================================
// Reducer
// ============================================

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_USER':
      return {
        ...state,
        currentUser: action.payload,
        isUserInitialized: true,
      };

    case 'SET_PROJECTS':
      return {
        ...state,
        projects: action.payload,
      };

    case 'SET_CURRENT_PROJECT':
      return {
        ...state,
        currentProject: action.payload,
      };

    case 'ADD_PROJECT':
      return {
        ...state,
        projects: [action.payload, ...state.projects],
      };

    case 'UPDATE_PROJECT':
      return {
        ...state,
        projects: state.projects.map((p) =>
          p.id === action.payload.id ? { ...p, ...action.payload.updates } : p
        ),
        currentProject:
          state.currentProject?.id === action.payload.id
            ? { ...state.currentProject, ...action.payload.updates }
            : state.currentProject,
      };

    case 'DELETE_PROJECT':
      return {
        ...state,
        projects: state.projects.filter((p) => p.id !== action.payload),
        currentProject:
          state.currentProject?.id === action.payload ? null : state.currentProject,
      };

    case 'SET_VIEW_MODE':
      return {
        ...state,
        viewMode: action.payload,
      };

    case 'SET_LOADING':
      return {
        ...state,
        isLoading: action.payload,
      };

    case 'SET_INITIALIZED':
      return {
        ...state,
        isInitialized: action.payload,
      };

    case 'SET_ERROR':
      return {
        ...state,
        error: action.payload,
      };

    default:
      return state;
  }
}

// ============================================
// Context
// ============================================

interface AppContextValue {
  state: AppState;
  dispatch: React.Dispatch<AppAction>;

  // Helpers
  initializeApp: () => Promise<void>;
  createProject: (name: string, description?: string) => Promise<Project>;
  updateProject: (id: string, updates: { name?: string; description?: string }) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  selectProject: (project: Project | null) => void;
  setViewMode: (mode: ViewMode) => void;
  refreshProjects: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

// ============================================
// Provider
// ============================================

interface AppProviderProps {
  children: ReactNode;
}

export function AppProvider({ children }: AppProviderProps) {
  const [state, dispatch] = useReducer(appReducer, initialState);

  // アプリ初期化
  const initializeApp = useCallback(async () => {
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_ERROR', payload: null });

    try {
      // 1. データベース初期化
      await dbService.initialize();

      // 2. デフォルトユーザー初期化
      const user = await userService.initializeDefaultUser();
      dispatch({ type: 'SET_USER', payload: user });

      // 3. ユーザーのプロジェクト一覧取得
      const projects = await projectService.getProjectsForCurrentUser();
      dispatch({ type: 'SET_PROJECTS', payload: projects });

      dispatch({ type: 'SET_INITIALIZED', payload: true });
    } catch (error) {
      console.error('Failed to initialize app:', error);
      dispatch({
        type: 'SET_ERROR',
        payload: 'アプリの初期化に失敗しました',
      });
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, []);

  // プロジェクト作成
  const createProject = useCallback(
    async (name: string, description?: string): Promise<Project> => {
      const project = await projectService.createProject(name, description);
      dispatch({ type: 'ADD_PROJECT', payload: project });
      return project;
    },
    []
  );

  // プロジェクト更新
  const updateProject = useCallback(
    async (id: string, updates: { name?: string; description?: string }): Promise<void> => {
      await projectService.updateProject(id, updates);
      dispatch({ type: 'UPDATE_PROJECT', payload: { id, updates } });
    },
    []
  );

  // プロジェクト削除
  const deleteProject = useCallback(async (id: string): Promise<void> => {
    await projectService.deleteProject(id);
    dispatch({ type: 'DELETE_PROJECT', payload: id });
  }, []);

  // プロジェクト選択
  const selectProject = useCallback((project: Project | null): void => {
    dispatch({ type: 'SET_CURRENT_PROJECT', payload: project });
  }, []);

  // ビューモード変更
  const setViewMode = useCallback((mode: ViewMode): void => {
    dispatch({ type: 'SET_VIEW_MODE', payload: mode });
  }, []);

  // プロジェクト一覧更新
  const refreshProjects = useCallback(async (): Promise<void> => {
    try {
      const projects = await projectService.getProjectsForCurrentUser();
      dispatch({ type: 'SET_PROJECTS', payload: projects });
    } catch (error) {
      console.error('Failed to refresh projects:', error);
    }
  }, []);

  // 初回マウント時に初期化
  useEffect(() => {
    initializeApp();
  }, [initializeApp]);

  const value: AppContextValue = {
    state,
    dispatch,
    initializeApp,
    createProject,
    updateProject,
    deleteProject,
    selectProject,
    setViewMode,
    refreshProjects,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

// ============================================
// Hook
// ============================================

export function useApp(): AppContextValue {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}

// 便利なセレクタフック
export function useCurrentUser(): User | null {
  const { state } = useApp();
  return state.currentUser;
}

export function useProjects(): Project[] {
  const { state } = useApp();
  return state.projects;
}

export function useCurrentProject(): Project | null {
  const { state } = useApp();
  return state.currentProject;
}

export function useViewMode(): ViewMode {
  const { state } = useApp();
  return state.viewMode;
}

export function useIsLoading(): boolean {
  const { state } = useApp();
  return state.isLoading;
}

export function useIsInitialized(): boolean {
  const { state } = useApp();
  return state.isInitialized;
}

export function useAppError(): string | null {
  const { state } = useApp();
  return state.error;
}
