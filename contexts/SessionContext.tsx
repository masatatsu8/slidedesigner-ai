import React, {
  createContext,
  useContext,
  useReducer,
  useCallback,
  ReactNode,
} from 'react';
import { sessionService } from '../services/sessionService';
import type {
  Session,
  StoredImage,
  Conversation,
  ComplexityLevel,
  ImageResolution,
} from '../types';

// ============================================
// State & Actions
// ============================================

interface SessionState {
  // セッション関連
  sessions: Session[];
  currentSession: Session | null;

  // 画像関連
  images: StoredImage[];
  selectedImageId: string | null;

  // 会話履歴
  conversations: Conversation[];

  // 統計情報
  stats: {
    imageCount: number;
    totalCost: number;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  } | null;

  // 状態
  isLoading: boolean;
  error: string | null;
}

type SessionAction =
  | { type: 'SET_SESSIONS'; payload: Session[] }
  | { type: 'SET_CURRENT_SESSION'; payload: Session | null }
  | { type: 'ADD_SESSION'; payload: Session }
  | { type: 'UPDATE_SESSION'; payload: { id: string; updates: Partial<Session> } }
  | { type: 'DELETE_SESSION'; payload: string }
  | { type: 'SET_IMAGES'; payload: StoredImage[] }
  | { type: 'ADD_IMAGE'; payload: StoredImage }
  | { type: 'DELETE_IMAGE'; payload: string }
  | { type: 'SELECT_IMAGE'; payload: string | null }
  | { type: 'SET_CONVERSATIONS'; payload: Conversation[] }
  | { type: 'ADD_CONVERSATION'; payload: Conversation }
  | { type: 'SET_STATS'; payload: SessionState['stats'] }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'CLEAR_SESSION' };

const initialState: SessionState = {
  sessions: [],
  currentSession: null,
  images: [],
  selectedImageId: null,
  conversations: [],
  stats: null,
  isLoading: false,
  error: null,
};

// ============================================
// Reducer
// ============================================

function sessionReducer(state: SessionState, action: SessionAction): SessionState {
  switch (action.type) {
    case 'SET_SESSIONS':
      return {
        ...state,
        sessions: action.payload,
      };

    case 'SET_CURRENT_SESSION':
      return {
        ...state,
        currentSession: action.payload,
      };

    case 'ADD_SESSION':
      return {
        ...state,
        sessions: [action.payload, ...state.sessions],
      };

    case 'UPDATE_SESSION':
      return {
        ...state,
        sessions: state.sessions.map((s) =>
          s.id === action.payload.id ? { ...s, ...action.payload.updates } : s
        ),
        currentSession:
          state.currentSession?.id === action.payload.id
            ? { ...state.currentSession, ...action.payload.updates }
            : state.currentSession,
      };

    case 'DELETE_SESSION':
      return {
        ...state,
        sessions: state.sessions.filter((s) => s.id !== action.payload),
        currentSession:
          state.currentSession?.id === action.payload ? null : state.currentSession,
      };

    case 'SET_IMAGES':
      return {
        ...state,
        images: action.payload,
      };

    case 'ADD_IMAGE':
      return {
        ...state,
        images: [...state.images, action.payload],
      };

    case 'DELETE_IMAGE':
      return {
        ...state,
        images: state.images.filter((i) => i.id !== action.payload),
        selectedImageId:
          state.selectedImageId === action.payload ? null : state.selectedImageId,
      };

    case 'SELECT_IMAGE':
      return {
        ...state,
        selectedImageId: action.payload,
      };

    case 'SET_CONVERSATIONS':
      return {
        ...state,
        conversations: action.payload,
      };

    case 'ADD_CONVERSATION':
      return {
        ...state,
        conversations: [...state.conversations, action.payload],
      };

    case 'SET_STATS':
      return {
        ...state,
        stats: action.payload,
      };

    case 'SET_LOADING':
      return {
        ...state,
        isLoading: action.payload,
      };

    case 'SET_ERROR':
      return {
        ...state,
        error: action.payload,
      };

    case 'CLEAR_SESSION':
      return {
        ...initialState,
        sessions: state.sessions,
      };

    default:
      return state;
  }
}

// ============================================
// Context
// ============================================

interface SessionContextValue {
  state: SessionState;
  dispatch: React.Dispatch<SessionAction>;

  // セッション操作
  loadSessionsForProject: (projectId: string) => Promise<void>;
  createSession: (params: {
    projectId: string;
    name: string;
    inputText?: string;
    complexity?: ComplexityLevel;
    resolution?: ImageResolution;
    designRequests?: string;
    styleImageBase64?: string | null;
  }) => Promise<Session>;
  loadSession: (id: string) => Promise<void>;
  updateSession: (id: string, updates: Partial<Session>) => Promise<void>;
  deleteSession: (id: string) => Promise<void>;
  clearSession: () => void;

  // 画像操作
  saveImage: (params: {
    base64Data: string;
    prompt: string;
    inputTokens: number;
    outputTokens: number;
    estimatedCostUsd: number;
    generationType: 'initial' | 'refinement';
    parentImageId?: string | null;
  }) => Promise<StoredImage>;
  deleteImage: (id: string) => Promise<void>;
  selectImage: (id: string | null) => void;

  // 会話操作
  addUserMessage: (content: string, imageId?: string | null) => Promise<Conversation>;
  addAssistantMessage: (content: string, imageId?: string | null) => Promise<Conversation>;

  // 統計
  refreshStats: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

// ============================================
// Provider
// ============================================

interface SessionProviderProps {
  children: ReactNode;
}

export function SessionProvider({ children }: SessionProviderProps) {
  const [state, dispatch] = useReducer(sessionReducer, initialState);

  // プロジェクトのセッション一覧を読み込み
  const loadSessionsForProject = useCallback(async (projectId: string) => {
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_ERROR', payload: null });

    try {
      const { dbService } = await import('../services/dbService');
      const sessionsData = await dbService.getSessionsByProject(projectId);
      dispatch({ type: 'SET_SESSIONS', payload: sessionsData });
    } catch (error) {
      console.error('Failed to load sessions:', error);
      dispatch({ type: 'SET_ERROR', payload: 'セッションの読み込みに失敗しました' });
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, []);

  // セッション作成
  const createSession = useCallback(
    async (params: {
      projectId: string;
      name: string;
      inputText?: string;
      complexity?: ComplexityLevel;
      resolution?: ImageResolution;
      designRequests?: string;
      styleImageBase64?: string | null;
    }): Promise<Session> => {
      const session = await sessionService.createSession(params);
      dispatch({ type: 'ADD_SESSION', payload: session });
      return session;
    },
    []
  );

  // セッション読み込み
  const loadSession = useCallback(async (id: string) => {
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_ERROR', payload: null });

    try {
      const session = await sessionService.getSession(id);
      if (!session) {
        throw new Error('Session not found');
      }

      dispatch({ type: 'SET_CURRENT_SESSION', payload: session });

      // 画像と会話を並行して読み込み
      const [images, conversations, stats] = await Promise.all([
        sessionService.getImages(id),
        sessionService.getConversations(id),
        sessionService.getSessionStats(id),
      ]);

      dispatch({ type: 'SET_IMAGES', payload: images });
      dispatch({ type: 'SET_CONVERSATIONS', payload: conversations });
      dispatch({ type: 'SET_STATS', payload: stats });
    } catch (error) {
      console.error('Failed to load session:', error);
      dispatch({ type: 'SET_ERROR', payload: 'セッションの読み込みに失敗しました' });
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, []);

  // セッション更新
  const updateSession = useCallback(
    async (id: string, updates: Partial<Session>) => {
      await sessionService.updateSession(id, updates);
      dispatch({ type: 'UPDATE_SESSION', payload: { id, updates } });
    },
    []
  );

  // セッション削除
  const deleteSession = useCallback(async (id: string) => {
    await sessionService.deleteSession(id);
    dispatch({ type: 'DELETE_SESSION', payload: id });
  }, []);

  // セッションをクリア
  const clearSession = useCallback(() => {
    dispatch({ type: 'CLEAR_SESSION' });
  }, []);

  // 画像保存
  const saveImage = useCallback(
    async (params: {
      base64Data: string;
      prompt: string;
      inputTokens: number;
      outputTokens: number;
      estimatedCostUsd: number;
      generationType: 'initial' | 'refinement';
      parentImageId?: string | null;
    }): Promise<StoredImage> => {
      if (!state.currentSession) {
        throw new Error('No current session');
      }

      const image = await sessionService.saveImage({
        sessionId: state.currentSession.id,
        ...params,
      });

      dispatch({ type: 'ADD_IMAGE', payload: image });

      // 統計を更新
      const stats = await sessionService.getSessionStats(state.currentSession.id);
      dispatch({ type: 'SET_STATS', payload: stats });

      return image;
    },
    [state.currentSession]
  );

  // 画像削除
  const deleteImage = useCallback(async (id: string) => {
    await sessionService.deleteImage(id);
    dispatch({ type: 'DELETE_IMAGE', payload: id });

    // 統計を更新
    if (state.currentSession) {
      const stats = await sessionService.getSessionStats(state.currentSession.id);
      dispatch({ type: 'SET_STATS', payload: stats });
    }
  }, [state.currentSession]);

  // 画像選択
  const selectImage = useCallback((id: string | null) => {
    dispatch({ type: 'SELECT_IMAGE', payload: id });
  }, []);

  // ユーザーメッセージ追加
  const addUserMessage = useCallback(
    async (content: string, imageId?: string | null): Promise<Conversation> => {
      if (!state.currentSession) {
        throw new Error('No current session');
      }

      const conversation = await sessionService.addUserMessage(
        state.currentSession.id,
        content,
        imageId
      );

      dispatch({ type: 'ADD_CONVERSATION', payload: conversation });
      return conversation;
    },
    [state.currentSession]
  );

  // アシスタントメッセージ追加
  const addAssistantMessage = useCallback(
    async (content: string, imageId?: string | null): Promise<Conversation> => {
      if (!state.currentSession) {
        throw new Error('No current session');
      }

      const conversation = await sessionService.addAssistantMessage(
        state.currentSession.id,
        content,
        imageId
      );

      dispatch({ type: 'ADD_CONVERSATION', payload: conversation });
      return conversation;
    },
    [state.currentSession]
  );

  // 統計を更新
  const refreshStats = useCallback(async () => {
    if (!state.currentSession) return;

    const stats = await sessionService.getSessionStats(state.currentSession.id);
    dispatch({ type: 'SET_STATS', payload: stats });
  }, [state.currentSession]);

  const value: SessionContextValue = {
    state,
    dispatch,
    loadSessionsForProject,
    createSession,
    loadSession,
    updateSession,
    deleteSession,
    clearSession,
    saveImage,
    deleteImage,
    selectImage,
    addUserMessage,
    addAssistantMessage,
    refreshStats,
  };

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

// ============================================
// Hook
// ============================================

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error('useSession must be used within a SessionProvider');
  }
  return context;
}

// 便利なセレクタフック
export function useSessions(): Session[] {
  const { state } = useSession();
  return state.sessions;
}

export function useCurrentSession(): Session | null {
  const { state } = useSession();
  return state.currentSession;
}

export function useImages(): StoredImage[] {
  const { state } = useSession();
  return state.images;
}

export function useSelectedImage(): StoredImage | null {
  const { state } = useSession();
  if (!state.selectedImageId) return null;
  return state.images.find((i) => i.id === state.selectedImageId) || null;
}

export function useConversations(): Conversation[] {
  const { state } = useSession();
  return state.conversations;
}

export function useSessionStats(): SessionState['stats'] {
  const { state } = useSession();
  return state.stats;
}

export function useSessionLoading(): boolean {
  const { state } = useSession();
  return state.isLoading;
}

export function useSessionError(): string | null {
  const { state } = useSession();
  return state.error;
}
