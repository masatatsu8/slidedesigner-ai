import React from 'react';
import { AppProvider, useViewMode, useIsInitialized, useIsLoading, useAppError } from './contexts/AppContext';
import { SessionProvider } from './contexts/SessionContext';
import { ProjectListView } from './views/ProjectListView';
import { SessionListView } from './views/SessionListView';
import { LegacyCreateView } from './views/LegacyCreateView';
import { Spinner } from './components/Spinner';
import { ViewMode } from './types';

// メインのルーティングコンポーネント
function AppRouter() {
  const viewMode = useViewMode();
  const isInitialized = useIsInitialized();
  const isLoading = useIsLoading();
  const error = useAppError();

  // 初期化中はローディング表示
  if (!isInitialized && isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Spinner />
          <p className="mt-4 text-gray-500">初期化中...</p>
        </div>
      </div>
    );
  }

  // エラー時はエラー表示
  if (error && !isInitialized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center max-w-md">
          <div className="text-red-500 text-lg mb-4">{error}</div>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
          >
            再読み込み
          </button>
        </div>
      </div>
    );
  }

  // ビューモードに応じたコンポーネントを表示
  switch (viewMode) {
    case 'PROJECT_LIST' as ViewMode:
      return <ProjectListView />;
    case 'SESSION_LIST' as ViewMode:
      return <SessionListView />;
    case 'CREATE' as ViewMode:
      return <LegacyCreateView />;
    case 'AUTHOR' as ViewMode:
      // フェーズ2で実装予定
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="text-center">
            <p className="text-gray-500">オーサリングモードは準備中です</p>
          </div>
        </div>
      );
    default:
      return <ProjectListView />;
  }
}

// メインAppコンポーネント(Providers付き)
const App: React.FC = () => {
  return (
    <AppProvider>
      <SessionProvider>
        <AppRouter />
      </SessionProvider>
    </AppProvider>
  );
};

export default App;
