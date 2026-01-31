
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Header } from '../components/Header';
import { Spinner } from '../components/Spinner';
import { generateInfographicDrafts, editInfographic, getRefinementSuggestions, analyzeImageSplitPoints } from '../services/geminiService';
import { generatePowerPoint } from '../services/pptService';
import { saveImageToLocal } from '../services/fileApiService';
import { useApp, useCurrentProject } from '../contexts/AppContext';
import { useSession, useCurrentSession } from '../contexts/SessionContext';
import { GeneratedImage, AppState, TokenUsage, ComplexityLevel, ImageResolution, ViewMode } from '../types';

// パンくずコンポーネント
interface BreadcrumbProps {
  projectName: string | null;
  sessionName: string | null;
  onNavigateToProjects: () => void;
  onNavigateToSessions: () => void;
}

const Breadcrumb: React.FC<BreadcrumbProps> = ({
  projectName,
  sessionName,
  onNavigateToProjects,
  onNavigateToSessions,
}) => {
  return (
    <nav className="bg-gray-50 border-b border-gray-200 px-4 py-2">
      <div className="max-w-7xl mx-auto flex items-center text-sm">
        <button
          onClick={onNavigateToProjects}
          className="text-indigo-600 hover:text-indigo-800 hover:underline font-medium"
        >
          InfographAI
        </button>

        {projectName && (
          <>
            <svg className="w-4 h-4 mx-2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            <button
              onClick={onNavigateToSessions}
              className="text-indigo-600 hover:text-indigo-800 hover:underline font-medium"
            >
              {projectName}
            </button>
          </>
        )}

        {sessionName && (
          <>
            <svg className="w-4 h-4 mx-2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            <span className="text-gray-700 font-medium">{sessionName}</span>
          </>
        )}
      </div>
    </nav>
  );
};

export const LegacyCreateView: React.FC = () => {
  const { setViewMode } = useApp();
  const currentProject = useCurrentProject();
  const currentSession = useCurrentSession();
  const { saveImage: saveImageToDb } = useSession();

  const [appState, setAppState] = useState<AppState>(AppState.INPUT);
  const [inputText, setInputText] = useState<string>('');
  const [complexity, setComplexity] = useState<ComplexityLevel>(ComplexityLevel.VERY_SIMPLE);
  const [resolution, setResolution] = useState<ImageResolution>('1K');
  const [designRequests, setDesignRequests] = useState<string>('');

  // Style Reference State
  const [styleImageBase64, setStyleImageBase64] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([]);
  // History state to store all generations across the session
  const [history, setHistory] = useState<GeneratedImage[]>([]);
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [refinementInput, setRefinementInput] = useState<string>('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isPptGenerating, setIsPptGenerating] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [hasApiKey, setHasApiKey] = useState<boolean>(false);
  const [saveStatus, setSaveStatus] = useState<string>('');

  // Refs for auto-scrolling
  const galleryRef = useRef<HTMLDivElement>(null);
  const refineRef = useRef<HTMLDivElement>(null);

  // ナビゲーション関数
  const handleNavigateToProjects = useCallback(() => {
    setViewMode(ViewMode.PROJECT_LIST);
  }, [setViewMode]);

  const handleNavigateToSessions = useCallback(() => {
    setViewMode(ViewMode.SESSION_LIST);
  }, [setViewMode]);

  // セッションの初期値をロード
  useEffect(() => {
    if (currentSession) {
      setInputText(currentSession.inputText || '');
      setComplexity(currentSession.complexity || ComplexityLevel.VERY_SIMPLE);
      setResolution(currentSession.resolution || '1K');
      setDesignRequests(currentSession.designRequests || '');
      setStyleImageBase64(currentSession.styleImageBase64 || null);
    }
  }, [currentSession]);

  // Initialize Gemini API Key check
  useEffect(() => {
    const checkKey = async () => {
      const aiStudio = (window as any).aistudio;
      if (aiStudio) {
        try {
          const hasKey = await aiStudio.hasSelectedApiKey();
          setHasApiKey(hasKey);
        } catch (e) {
          console.error("Error checking API key:", e);
          setHasApiKey(false);
        }
      } else {
        setHasApiKey(true);
      }
    };
    checkKey();
  }, []);

  const handleSelectApiKey = async () => {
    const aiStudio = (window as any).aistudio;
    if (aiStudio) {
      try {
        await aiStudio.openSelectKey();
        setHasApiKey(true);
      } catch (e) {
        console.error("Error selecting API key:", e);
      }
    }
  };

  // ローカルファイルに自動保存
  const autoSaveToLocal = async (images: GeneratedImage[], generationType: 'initial' | 'refinement' = 'initial') => {
    if (!currentProject || !currentSession) {
      console.warn('No project or session selected, skipping local save');
      return;
    }

    setSaveStatus("ローカルに保存中...");
    let successCount = 0;

    for (const img of images) {
      try {
        // ローカルファイルに保存
        await saveImageToLocal({
          projectId: currentProject.id,
          sessionId: currentSession.id,
          base64Data: img.base64Data,
        });

        // DBにも保存
        await saveImageToDb({
          base64Data: img.base64Data,
          prompt: img.prompt,
          inputTokens: img.usage?.inputTokens || 0,
          outputTokens: img.usage?.outputTokens || 0,
          estimatedCostUsd: img.usage?.estimatedCostUSD || 0,
          generationType,
          parentImageId: null,
        });

        successCount++;
      } catch (e) {
        console.error("Save failed for image", img.id, e);
      }
    }

    if (successCount > 0) {
      setSaveStatus(`${successCount}枚の画像を保存しました`);
      setTimeout(() => setSaveStatus(""), 4000);
    } else {
      setSaveStatus("保存に失敗しました");
      setTimeout(() => setSaveStatus(""), 4000);
    }
  };

  const addToHistory = (newImages: GeneratedImage[]) => {
    setHistory(prev => [...newImages, ...prev]);
  };

  // Style Image Handlers
  const handleStyleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        const rawBase64 = base64String.split(',')[1];
        setStyleImageBase64(rawBase64);
      };
      reader.readAsDataURL(file);
    }
  };

  const removeStyleImage = () => {
    setStyleImageBase64(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleGenerate = useCallback(async () => {
    if (!inputText.trim()) return;

    setIsLoading(true);
    setAppState(AppState.GENERATING);
    setError(null);
    setGeneratedImages([]); // Clear current view
    setSelectedImageId(null);

    try {
      // Generate images with selected complexity, design requests, resolution, AND style image
      const results = await generateInfographicDrafts(
        inputText,
        complexity,
        designRequests,
        resolution,
        styleImageBase64 || undefined // Pass undefined if null
      );

      if (results.length === 0) {
        throw new Error("画像を生成できませんでした。もう一度お試しください。");
      }

      const newImages: GeneratedImage[] = results.map(res => ({
        id: uuidv4(),
        url: `data:image/png;base64,${res.data}`,
        base64Data: res.data,
        prompt: inputText,
        timestamp: Date.now(),
        usage: res.usage
      }));

      setGeneratedImages(newImages);
      addToHistory(newImages);
      setAppState(AppState.GALLERY);

      // ローカルファイルに自動保存
      autoSaveToLocal(newImages, 'initial');

      // Generate suggestions in background
      getRefinementSuggestions(inputText).then(setSuggestions);

    } catch (err) {
      setError(err instanceof Error ? err.message : "予期せぬエラーが発生しました");
      setAppState(AppState.INPUT);
      if (err instanceof Error && err.message.includes("Requested entity was not found")) {
          setHasApiKey(false);
          handleSelectApiKey();
      }
    } finally {
      setIsLoading(false);
    }
  }, [inputText, complexity, designRequests, resolution, styleImageBase64, currentProject, currentSession]);

  const handleSelectImage = (id: string) => {
    setSelectedImageId(id);
    setAppState(AppState.REFINING);
    // Smooth scroll to refinement section
    setTimeout(() => {
        refineRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  const handleRefine = useCallback(async () => {
    const selectedImg = generatedImages.find(img => img.id === selectedImageId) || history.find(img => img.id === selectedImageId);
    if (!selectedImg || !refinementInput.trim()) return;

    setIsLoading(true);
    setError(null);

    try {
      // Use current resolution setting for editing
      const result = await editInfographic(selectedImg.base64Data, refinementInput, resolution);

      if (!result) {
        throw new Error("編集に失敗しました。");
      }

      const newImage: GeneratedImage = {
        id: uuidv4(),
        url: `data:image/png;base64,${result.data}`,
        base64Data: result.data,
        prompt: refinementInput,
        timestamp: Date.now(),
        usage: result.usage
      };

      // Add to the list and select it
      setGeneratedImages(prev => [...prev, newImage]);
      addToHistory([newImage]);
      setSelectedImageId(newImage.id);
      setRefinementInput(''); // Clear input

      // ローカルファイルに自動保存
      autoSaveToLocal([newImage], 'refinement');

    } catch (err) {
      setError(err instanceof Error ? err.message : "編集エラー");
      if (err instanceof Error && err.message.includes("Requested entity was not found")) {
          setHasApiKey(false);
          handleSelectApiKey();
      }
    } finally {
      setIsLoading(false);
    }
  }, [generatedImages, history, selectedImageId, refinementInput, resolution, currentProject, currentSession]);

  const handlePptGeneration = async () => {
    const selectedImg = getSelectedImageObject();
    if (!selectedImg) return;

    setIsPptGenerating(true);
    setError(null);

    try {
      // 1. Analyze image to get horizontal split points (safe Y-coordinates)
      const splitPoints = await analyzeImageSplitPoints(selectedImg.base64Data);

      // 2. Generate PPT using masking strategy
      await generatePowerPoint(selectedImg.base64Data, splitPoints);
    } catch (err) {
      console.error("PPT Generation Error:", err);
      setError("PowerPoint生成中にエラーが発生しました。");
    } finally {
      setIsPptGenerating(false);
    }
  };

  const applySuggestion = (suggestion: string) => {
    setRefinementInput(suggestion);
  };

  const restoreFromHistory = (img: GeneratedImage) => {
    // Restore logic: put this image into the current 'generatedImages' so it can be refined
    // If it's already there, just select it. If not, add it.
    if (!generatedImages.find(i => i.id === img.id)) {
      setGeneratedImages(prev => [...prev, img]);
    }
    setSelectedImageId(img.id);
    setAppState(AppState.REFINING);
    setTimeout(() => {
      refineRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  const getSelectedImageObject = () => generatedImages.find(img => img.id === selectedImageId) || history.find(img => img.id === selectedImageId);

  // Scroll effect when entering gallery
  useEffect(() => {
      if (appState === AppState.GALLERY && generatedImages.length > 0) {
          setTimeout(() => {
            galleryRef.current?.scrollIntoView({ behavior: 'smooth' });
          }, 100);
      }
  }, [appState, generatedImages.length]);

  const renderCostInfo = (usage?: TokenUsage) => {
    if (!usage) return null;
    return (
      <div className="text-[10px] text-gray-500 mt-1 flex flex-wrap gap-x-2 font-mono">
        <span className="font-semibold text-indigo-600">Est: ${usage.estimatedCostUSD.toFixed(4)}</span>
        <span>In: {usage.inputTokens.toLocaleString()}</span>
        <span>Out: {usage.outputTokens.toLocaleString()}</span>
      </div>
    );
  };

  if (!hasApiKey) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-4">
        <div className="bg-white p-8 rounded-2xl shadow-lg max-w-md w-full text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">APIキーが必要です</h2>
          <p className="text-gray-600 mb-6">
            Gemini 3 Pro Imageモデルを使用するには、課金有効なプロジェクトのAPIキーを選択する必要があります。
          </p>
          <button
            onClick={handleSelectApiKey}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 px-6 rounded-xl transition-colors"
          >
            APIキーを選択する
          </button>
           <div className="mt-4 text-sm">
            <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">
              課金設定について
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Header />

      {/* パンくずナビゲーション */}
      <Breadcrumb
        projectName={currentProject?.name || null}
        sessionName={currentSession?.name || null}
        onNavigateToProjects={handleNavigateToProjects}
        onNavigateToSessions={handleNavigateToSessions}
      />

      {/* Global Status Message */}
      {saveStatus && (
        <div className={`text-white text-xs py-1 text-center font-medium animate-pulse fixed top-16 left-0 right-0 z-40 ${saveStatus.includes("失敗") ? "bg-red-500" : "bg-blue-500"}`}>
          {saveStatus}
        </div>
      )}

      <main className="flex-grow container mx-auto px-4 py-8 max-w-5xl">

        {/* Input Section */}
        <section className="bg-white rounded-2xl shadow-sm p-6 mb-8 transition-all duration-500">
          <h2 className="text-2xl font-bold text-gray-800 mb-4">
            資料作成アシスタント
          </h2>
          <p className="text-gray-600 mb-6">
            伝えたいメッセージを入力してください。AIがわかりやすい16:9のインフォグラフィックを作成します。
          </p>

          <textarea
            className="w-full p-4 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none resize-none h-32 bg-white text-black text-lg"
            placeholder="例：2023年の売上は前年比120%増の5億円を達成。特にQ4の伸びが著しく、新製品Aの導入が大きく貢献した。来年度は海外展開を視野に入れている。"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            disabled={isLoading}
          />

          <div className="mt-6">
             <label className="block text-sm font-bold text-gray-700 mb-2">デザインの複雑さ (情報量)</label>
             <div className="grid grid-cols-3 gap-4">
                <button
                  onClick={() => setComplexity(ComplexityLevel.SOLID)}
                  className={`p-3 rounded-lg border text-sm font-medium transition-all flex flex-col items-center justify-center gap-1
                    ${complexity === ComplexityLevel.SOLID
                      ? 'bg-indigo-50 border-indigo-600 text-indigo-700 ring-1 ring-indigo-600'
                      : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300'}`}
                >
                   <span className="text-lg">🏢</span>
                   <span>しっかり (標準)</span>
                   <span className="text-[10px] text-gray-400 font-normal">ビジネス向け・詳細</span>
                </button>

                <button
                  onClick={() => setComplexity(ComplexityLevel.LIGHT)}
                  className={`p-3 rounded-lg border text-sm font-medium transition-all flex flex-col items-center justify-center gap-1
                    ${complexity === ComplexityLevel.LIGHT
                      ? 'bg-indigo-50 border-indigo-600 text-indigo-700 ring-1 ring-indigo-600'
                      : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300'}`}
                >
                   <span className="text-lg">🍃</span>
                   <span>ライトめ</span>
                   <span className="text-[10px] text-gray-400 font-normal">シンプル・親しみ</span>
                </button>

                <button
                  onClick={() => setComplexity(ComplexityLevel.VERY_SIMPLE)}
                  className={`p-3 rounded-lg border text-sm font-medium transition-all flex flex-col items-center justify-center gap-1
                    ${complexity === ComplexityLevel.VERY_SIMPLE
                      ? 'bg-indigo-50 border-indigo-600 text-indigo-700 ring-1 ring-indigo-600'
                      : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300'}`}
                >
                   <span className="text-lg">⚡</span>
                   <span>非常にシンプル</span>
                   <span className="text-[10px] text-gray-400 font-normal">要点のみ・インパクト</span>
                </button>
             </div>
          </div>

          {/* Resolution Setting */}
          <div className="mt-6">
               <label className="block text-sm font-bold text-gray-700 mb-2">画質設定</label>
               <div className="grid grid-cols-3 gap-4">
                  <label className={`flex items-center space-x-2 p-3 rounded-lg border cursor-pointer transition-all w-full
                    ${resolution === '1K'
                      ? 'bg-indigo-50 border-indigo-600 text-indigo-700 ring-1 ring-indigo-600'
                      : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                  >
                    <input
                      type="radio"
                      name="resolution"
                      value="1K"
                      checked={resolution === '1K'}
                      onChange={() => setResolution('1K')}
                      className="sr-only"
                    />
                    <span className="text-lg flex-shrink-0">📐</span>
                    <div className="flex flex-col overflow-hidden">
                       <span className="text-sm font-medium truncate">標準 (1K)</span>
                       <span className="text-[10px] opacity-70 truncate">素早く生成</span>
                    </div>
                  </label>

                  <label className={`flex items-center space-x-2 p-3 rounded-lg border cursor-pointer transition-all w-full
                    ${resolution === '2K'
                      ? 'bg-indigo-50 border-indigo-600 text-indigo-700 ring-1 ring-indigo-600'
                      : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                  >
                    <input
                      type="radio"
                      name="resolution"
                      value="2K"
                      checked={resolution === '2K'}
                      onChange={() => setResolution('2K')}
                      className="sr-only"
                    />
                    <span className="text-lg flex-shrink-0">✨</span>
                    <div className="flex flex-col overflow-hidden">
                       <span className="text-sm font-medium truncate">高画質 (2K)</span>
                       <span className="text-[10px] opacity-70 truncate">詳細でクリア</span>
                    </div>
                  </label>

                  <label className={`flex items-center space-x-2 p-3 rounded-lg border cursor-pointer transition-all w-full
                    ${resolution === '4K'
                      ? 'bg-indigo-50 border-indigo-600 text-indigo-700 ring-1 ring-indigo-600'
                      : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                  >
                    <input
                      type="radio"
                      name="resolution"
                      value="4K"
                      checked={resolution === '4K'}
                      onChange={() => setResolution('4K')}
                      className="sr-only"
                    />
                    <span className="text-lg flex-shrink-0">💎</span>
                    <div className="flex flex-col overflow-hidden">
                       <span className="text-sm font-medium truncate">超高画質 (4K)</span>
                       <span className="text-[10px] opacity-70 truncate">最高品質</span>
                    </div>
                  </label>
               </div>
          </div>

          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Design Requests (Left) */}
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">デザインの要望 (任意)</label>
              <textarea
                className="w-full p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none bg-white text-gray-700 h-32 resize-none"
                placeholder="例：全体的に青色を基調に、未来的な雰囲気で。フォントはゴシック体で力強く。"
                value={designRequests}
                onChange={(e) => setDesignRequests(e.target.value)}
                disabled={isLoading}
              />
            </div>

            {/* Style Reference Image Input (Right) */}
            <div>
               <label className="block text-sm font-bold text-gray-700 mb-2">スタイル参照画像 (オプション)</label>

               {!styleImageBase64 ? (
                 <div
                   onClick={() => fileInputRef.current?.click()}
                   className="border-2 border-dashed border-gray-300 rounded-xl h-32 flex flex-col items-center justify-center cursor-pointer hover:bg-gray-50 hover:border-indigo-400 transition-colors"
                 >
                   <svg className="w-8 h-8 text-gray-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                     <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                   </svg>
                   <span className="text-xs text-gray-600 font-medium">画像をアップロードしてスタイルを模倣</span>
                   <input
                     type="file"
                     ref={fileInputRef}
                     onChange={handleStyleImageUpload}
                     accept="image/*"
                     className="hidden"
                   />
                 </div>
               ) : (
                 <div className="relative h-32 w-full border border-gray-200 rounded-xl overflow-hidden shadow-sm bg-gray-50 flex items-center justify-center">
                   <img
                     src={`data:image/png;base64,${styleImageBase64}`}
                     alt="Style Reference"
                     className="max-w-full max-h-full object-contain"
                   />
                   <div className="absolute bottom-0 left-0 right-0 px-3 py-1 text-xs text-center text-gray-500 bg-white/90 border-t backdrop-blur-sm">スタイル参照中</div>
                   <button
                     onClick={removeStyleImage}
                     className="absolute top-2 right-2 bg-red-500 text-white p-1 rounded-full shadow hover:bg-red-600 transition-colors"
                     title="画像を削除"
                   >
                     <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                   </button>
                 </div>
               )}
            </div>
          </div>

          <div className="mt-8 flex justify-end">
            <button
              onClick={handleGenerate}
              disabled={isLoading || !inputText.trim()}
              className={`px-8 py-3 rounded-xl font-semibold text-white transition-all shadow-md flex items-center space-x-2
                ${isLoading || !inputText.trim()
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-indigo-600 hover:bg-indigo-700 hover:shadow-lg transform hover:-translate-y-0.5'}`}
            >
              {isLoading && appState === AppState.GENERATING ? (
                <>
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span>生成中... (3案作成)</span>
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
                  <span>インフォグラフィックを作成</span>
                </>
              )}
            </button>
          </div>

          {error && (
            <div className="mt-4 p-4 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm">
              {error}
            </div>
          )}
        </section>

        {/* Gallery Section */}
        {generatedImages.length > 0 && (
          <section ref={galleryRef} className="mb-12 animate-fade-in-up">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-gray-800 flex items-center">
                <span className="bg-indigo-100 text-indigo-700 w-8 h-8 rounded-full flex items-center justify-center mr-3 text-sm">1</span>
                デザイン案を選択
              </h3>
              <span className="text-sm text-gray-500">3つの案からベースを選んでください</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {generatedImages.slice(0, 3).map((img, index) => (
                <div
                  key={img.id}
                  onClick={() => !isLoading && handleSelectImage(img.id)}
                  className={`group relative cursor-pointer rounded-xl overflow-hidden transition-all duration-300 border-2 shadow-md bg-white
                    ${selectedImageId === img.id
                      ? 'border-indigo-600 ring-4 ring-indigo-100 scale-105'
                      : 'border-transparent hover:border-indigo-300 hover:shadow-xl'}`}
                >
                  <div className="aspect-video bg-gray-200 w-full relative">
                     <img
                        src={img.url}
                        alt={`Draft ${index + 1}`}
                        className="w-full h-full object-cover"
                        loading="lazy"
                     />
                  </div>
                  <div className="p-3 bg-white border-t">
                    {renderCostInfo(img.usage)}
                  </div>
                  <div className="absolute bottom-12 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-4 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                    <p className="text-white font-medium text-sm">案 {index + 1} を選択</p>
                  </div>
                  {selectedImageId === img.id && (
                     <div className="absolute top-2 left-2 bg-indigo-600 text-white p-1 rounded-full shadow-lg z-10">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                     </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Refinement Section */}
        {(selectedImageId && appState === AppState.REFINING) && (
          <section ref={refineRef} className="bg-white rounded-2xl shadow-lg overflow-hidden animate-fade-in-up border border-gray-100">
            <div className="p-6 md:p-8">
              <h3 className="text-xl font-bold text-gray-800 flex items-center mb-6">
                <span className="bg-indigo-100 text-indigo-700 w-8 h-8 rounded-full flex items-center justify-center mr-3 text-sm">2</span>
                ブラッシュアップ (編集)
              </h3>

              <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">

                {/* Preview Area */}
                <div className="lg:col-span-3">
                  <div className="bg-gray-100 rounded-xl overflow-hidden border border-gray-200 shadow-inner relative">
                    {isLoading ? (
                        <div className="aspect-video flex flex-col items-center justify-center text-gray-500 bg-gray-50">
                            <Spinner />
                            <p className="mt-4 text-sm font-medium animate-pulse">AIが修正中...</p>
                            {(resolution === '2K' || resolution === '4K') && (
                               <p className="mt-1 text-xs text-indigo-600">{resolution}高画質生成中...通常より時間がかかります</p>
                            )}
                        </div>
                    ) : (
                        <div className="relative group">
                             <img
                                src={getSelectedImageObject()?.url}
                                alt="Current Version"
                                className="w-full h-auto object-contain"
                            />
                            <div className="absolute bottom-4 right-4 flex space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <a
                                    href={getSelectedImageObject()?.url}
                                    download={`infograph_${selectedImageId}.png`}
                                    className="bg-white/90 hover:bg-white text-gray-800 px-4 py-2 rounded-lg text-sm font-medium shadow-lg flex items-center"
                                >
                                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                                    画像DL
                                </a>
                                <button
                                    onClick={handlePptGeneration}
                                    disabled={isPptGenerating}
                                    className="bg-orange-500/90 hover:bg-orange-600 text-white px-4 py-2 rounded-lg text-sm font-medium shadow-lg flex items-center disabled:bg-gray-400"
                                >
                                    {isPptGenerating ? (
                                       <svg className="animate-spin h-4 w-4 mr-2 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                       </svg>
                                    ) : (
                                       <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" /></svg>
                                    )}
                                    PPT作成
                                </button>
                            </div>
                        </div>
                    )}
                  </div>
                  <div className="mt-4 flex flex-col text-sm text-gray-500">
                     <div className="flex justify-between items-center mb-2">
                        <span>現在のバージョン</span>
                        {generatedImages.filter(img => img.prompt !== inputText).length > 0 && (
                            <span className="text-xs bg-gray-100 px-2 py-1 rounded">編集履歴: {generatedImages.length}枚</span>
                        )}
                     </div>
                     {getSelectedImageObject()?.usage && (
                         <div className="bg-gray-50 p-2 rounded border border-gray-100">
                            {renderCostInfo(getSelectedImageObject()?.usage)}
                         </div>
                     )}
                  </div>
                </div>

                {/* Controls Area */}
                <div className="lg:col-span-2 flex flex-col h-full">
                  <div className="flex-grow">
                    <label className="block text-sm font-bold text-gray-700 mb-2">
                      修正指示を入力
                    </label>
                    <p className="text-xs text-gray-500 mb-3">
                        「背景の人物を消して」「色をもっと明るく」「レトロなフィルターを追加」など
                    </p>
                    <div className="relative">
                        <textarea
                            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none resize-none text-sm min-h-[100px]"
                            placeholder="ここに修正内容を入力..."
                            value={refinementInput}
                            onChange={(e) => setRefinementInput(e.target.value)}
                            disabled={isLoading}
                        />
                        <button
                            onClick={handleRefine}
                            disabled={isLoading || !refinementInput.trim()}
                            className={`absolute bottom-3 right-3 p-2 rounded-lg transition-colors ${
                                !refinementInput.trim() || isLoading
                                ? 'bg-gray-200 text-gray-400'
                                : 'bg-indigo-600 text-white hover:bg-indigo-700'
                            }`}
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                        </button>
                    </div>

                    {/* AI Suggestions */}
                    {suggestions.length > 0 && (
                        <div className="mt-6">
                            <div className="flex items-center mb-3">
                                <svg className="w-4 h-4 text-amber-500 mr-1" fill="currentColor" viewBox="0 0 20 20"><path d="M11 3a1 1 0 10-2 0v1a1 1 0 102 0V3zM15.657 5.757a1 1 0 00-1.414-1.414l-.707.707a1 1 0 001.414 1.414l.707-.707zM18 10a1 1 0 01-1 1h-1a1 1 0 110-2h1a1 1 0 011 1zM5.05 6.464A1 1 0 106.464 5.05l-.707-.707a1 1 0 00-1.414 1.414l.707.707zM5 10a1 1 0 01-1 1H3a1 1 0 110-2h1a1 1 0 011 1zM8 16v-1h4v1a2 2 0 11-4 0zM12 14c.015-.34.208-.646.477-.859a4 4 0 10-4.954 0c.27.213.462.519.476.859h4.002z" /></svg>
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                                    AIからの提案
                                </label>
                            </div>
                            <div className="space-y-2">
                                {suggestions.map((suggestion, idx) => (
                                    <button
                                        key={idx}
                                        onClick={() => applySuggestion(suggestion)}
                                        disabled={isLoading}
                                        className="w-full text-left text-sm p-3 rounded-lg bg-amber-50 border border-amber-100 text-amber-800 hover:bg-amber-100 transition-colors flex items-start group"
                                    >
                                        <span className="mr-2 mt-0.5 text-amber-400 group-hover:text-amber-600">•</span>
                                        {suggestion}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* History Section */}
        {history.length > 0 && (
          <section className="mt-12 border-t pt-8">
             <h3 className="text-lg font-bold text-gray-700 mb-4 flex items-center">
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                作成履歴 (セッション中)
             </h3>
             <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {history.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => restoreFromHistory(item)}
                    className={`bg-white rounded-lg shadow border cursor-pointer hover:shadow-md transition-all overflow-hidden ${selectedImageId === item.id ? 'ring-2 ring-indigo-500' : ''}`}
                  >
                     <div className="aspect-video bg-gray-100 relative">
                        <img src={item.url} alt="History item" className="w-full h-full object-cover" loading="lazy"/>
                     </div>
                     <div className="p-3">
                        <p className="text-xs text-gray-800 line-clamp-2 h-8 mb-1" title={item.prompt}>{item.prompt}</p>
                        <div className="text-[10px] text-gray-400 flex justify-between items-center">
                            <span>{new Date(item.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                            {item.usage && <span className="font-mono text-indigo-600">${item.usage.estimatedCostUSD.toFixed(4)}</span>}
                        </div>
                     </div>
                  </div>
                ))}
             </div>
          </section>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t py-8 mt-auto">
         <div className="container mx-auto px-4 text-center text-gray-400 text-sm">
            <p>&copy; 2024 InfographAI. Powered by Gemini 3 Pro Image.</p>
         </div>
      </footer>
    </div>
  );
};
