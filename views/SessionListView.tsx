import React, { useState, useEffect } from 'react';
import { useApp, useCurrentProject } from '../contexts/AppContext';
import { useSession, useSessions, useSessionLoading, useSessionError } from '../contexts/SessionContext';
import { sessionService } from '../services/sessionService';
import { Spinner } from '../components/Spinner';
import type { Session, ViewMode } from '../types';

interface SessionCardProps {
  session: Session;
  onOpen: () => void;
  onDelete: () => void;
}

function SessionCard({ session, onOpen, onDelete }: SessionCardProps) {
  const [stats, setStats] = useState<{ imageCount: number; totalCost: number } | null>(null);
  const [showMenu, setShowMenu] = useState(false);

  useEffect(() => {
    sessionService.getSessionStats(session.id).then((s) => {
      setStats({ imageCount: s.imageCount, totalCost: s.totalCost });
    });
  }, [session.id]);

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getComplexityLabel = (complexity: string) => {
    switch (complexity) {
      case 'SOLID': return 'しっかり';
      case 'LIGHT': return 'ライトめ';
      case 'VERY_SIMPLE': return '非常にシンプル';
      default: return complexity;
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow">
      <div className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold text-gray-800 truncate" title={session.name}>
              {session.name}
            </h3>
            <div className="flex items-center text-xs text-gray-400 mt-1 space-x-2">
              <span className="bg-gray-100 px-2 py-0.5 rounded">{getComplexityLabel(session.complexity)}</span>
              <span className="bg-gray-100 px-2 py-0.5 rounded">{session.resolution}</span>
            </div>
          </div>
          <div className="relative ml-2">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="p-1 text-gray-400 hover:text-gray-600 rounded"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
              </svg>
            </button>
            {showMenu && (
              <div className="absolute right-0 mt-1 w-32 bg-white rounded-md shadow-lg border z-10">
                <button
                  onClick={() => {
                    setShowMenu(false);
                    onDelete();
                  }}
                  className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                >
                  削除
                </button>
              </div>
            )}
          </div>
        </div>

        {session.inputText && (
          <p className="text-sm text-gray-500 mb-3 line-clamp-2">
            {session.inputText}
          </p>
        )}

        <div className="flex items-center text-xs text-gray-400 space-x-4 mb-4">
          {stats && (
            <>
              <span>画像: {stats.imageCount}枚</span>
              <span className="font-mono text-indigo-600">${stats.totalCost.toFixed(4)}</span>
            </>
          )}
          <span>{formatDate(session.updatedAt)}</span>
        </div>

        <button
          onClick={onOpen}
          className="w-full py-2 px-4 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 transition-colors text-sm font-medium"
        >
          開く
        </button>
      </div>
    </div>
  );
}

interface CreateSessionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (name: string) => Promise<void>;
}

function CreateSessionModal({ isOpen, onClose, onCreate }: CreateSessionModalProps) {
  const [name, setName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsCreating(true);
    try {
      await onCreate(name.trim());
      setName('');
      onClose();
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
        <div className="p-6">
          <h2 className="text-xl font-bold text-gray-800 mb-4">新規セッション</h2>
          <form onSubmit={handleSubmit}>
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                セッション名 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                placeholder="新しいインフォグラフィック"
                autoFocus
              />
            </div>
            <div className="flex justify-end space-x-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-gray-600 hover:text-gray-800"
                disabled={isCreating}
              >
                キャンセル
              </button>
              <button
                type="submit"
                disabled={!name.trim() || isCreating}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                {isCreating ? '作成中...' : '作成'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export function SessionListView() {
  const { setViewMode, selectProject } = useApp();
  const currentProject = useCurrentProject();
  const { loadSessionsForProject, createSession, deleteSession, loadSession } = useSession();
  const sessions = useSessions();
  const isLoading = useSessionLoading();
  const error = useSessionError();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  useEffect(() => {
    if (currentProject) {
      loadSessionsForProject(currentProject.id);
    }
  }, [currentProject, loadSessionsForProject]);

  const handleBack = () => {
    selectProject(null);
    setViewMode('PROJECT_LIST' as ViewMode);
  };

  const handleOpenSession = async (session: Session) => {
    await loadSession(session.id);
    setViewMode('CREATE' as ViewMode);
  };

  const handleCreateSession = async (name: string) => {
    if (!currentProject) return;
    const session = await createSession({
      projectId: currentProject.id,
      name,
    });
    await loadSession(session.id);
    setViewMode('CREATE' as ViewMode);
  };

  const handleDeleteSession = async (id: string) => {
    await deleteSession(id);
    setDeleteConfirm(null);
  };

  if (!currentProject) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="text-gray-500 mb-4">プロジェクトが選択されていません</div>
          <button
            onClick={handleBack}
            className="text-indigo-600 hover:underline"
          >
            プロジェクト一覧に戻る
          </button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={handleBack}
            className="flex items-center text-gray-500 hover:text-gray-700 mb-4"
          >
            <svg className="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            プロジェクト一覧
          </button>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-800">{currentProject.name}</h1>
              {currentProject.description && (
                <p className="text-gray-500 text-sm mt-1">{currentProject.description}</p>
              )}
            </div>
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
            >
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              新規セッション
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 rounded-lg p-4 mb-6">
            {error}
          </div>
        )}

        {/* Sessions Grid */}
        {sessions.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
            <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <h3 className="text-lg font-medium text-gray-600 mb-2">セッションがありません</h3>
            <p className="text-gray-400 mb-4">最初のセッションを作成してインフォグラフィックを生成しましょう</p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
            >
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              新規セッションを作成
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {sessions.map((session) => (
              <SessionCard
                key={session.id}
                session={session}
                onOpen={() => handleOpenSession(session)}
                onDelete={() => setDeleteConfirm(session.id)}
              />
            ))}
          </div>
        )}
      </div>

      <CreateSessionModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreate={handleCreateSession}
      />

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-sm mx-4 p-6">
            <h3 className="text-lg font-bold text-gray-800 mb-2">セッションを削除</h3>
            <p className="text-gray-600 mb-6">
              このセッションと全ての画像・会話履歴が削除されます。この操作は元に戻せません。
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 text-gray-600 hover:text-gray-800"
              >
                キャンセル
              </button>
              <button
                onClick={() => handleDeleteSession(deleteConfirm)}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
              >
                削除する
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
