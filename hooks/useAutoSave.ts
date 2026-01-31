import { useEffect, useRef, useCallback } from 'react';
import { dbService } from '../services/dbService';

interface UseAutoSaveOptions {
  /** 自動保存の間隔(ミリ秒)。デフォルトは5000ms */
  interval?: number;
  /** 自動保存を有効にするかどうか。デフォルトはtrue */
  enabled?: boolean;
  /** 保存完了時のコールバック */
  onSave?: () => void;
  /** エラー時のコールバック */
  onError?: (error: Error) => void;
}

interface UseAutoSaveReturn {
  /** 手動で即時保存を実行 */
  saveNow: () => Promise<void>;
  /** 最後に保存された時刻(タイムスタンプ) */
  lastSavedAt: number | null;
  /** 保存中かどうか */
  isSaving: boolean;
}

/**
 * データベースの自動永続化を管理するフック
 *
 * sql.jsはメモリ上で動作するため、定期的にOPFSに永続化する必要がある。
 * このフックは指定された間隔で自動的にdbService.persist()を呼び出す。
 */
export function useAutoSave(options: UseAutoSaveOptions = {}): UseAutoSaveReturn {
  const {
    interval = 5000,
    enabled = true,
    onSave,
    onError,
  } = options;

  const lastSavedAtRef = useRef<number | null>(null);
  const isSavingRef = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const saveNow = useCallback(async () => {
    if (isSavingRef.current) return;

    isSavingRef.current = true;
    try {
      await dbService.persist();
      lastSavedAtRef.current = Date.now();
      onSave?.();
    } catch (error) {
      console.error('Auto-save failed:', error);
      onError?.(error instanceof Error ? error : new Error(String(error)));
    } finally {
      isSavingRef.current = false;
    }
  }, [onSave, onError]);

  // 自動保存のインターバルを設定
  useEffect(() => {
    if (!enabled) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    intervalRef.current = setInterval(() => {
      saveNow();
    }, interval);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [enabled, interval, saveNow]);

  // ページ離脱時に保存
  useEffect(() => {
    const handleBeforeUnload = () => {
      // 同期的に保存を試みる(ベストエフォート)
      // 注意: persistは非同期なので完全な保存は保証されない
      dbService.persist().catch(console.error);
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  // visibilitychange時に保存(タブがバックグラウンドになった時)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        saveNow();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [saveNow]);

  return {
    saveNow,
    lastSavedAt: lastSavedAtRef.current,
    isSaving: isSavingRef.current,
  };
}

/**
 * 変更追跡付き自動保存フック
 *
 * データが変更されたときのみ保存を実行する。
 */
export function useAutoSaveWithTracking<T>(
  data: T,
  options: UseAutoSaveOptions = {}
): UseAutoSaveReturn & { hasUnsavedChanges: boolean } {
  const previousDataRef = useRef<string>('');
  const hasUnsavedChangesRef = useRef(false);

  const {
    onSave: originalOnSave,
    ...restOptions
  } = options;

  const onSave = useCallback(() => {
    hasUnsavedChangesRef.current = false;
    originalOnSave?.();
  }, [originalOnSave]);

  const autoSave = useAutoSave({ ...restOptions, onSave });

  // データ変更を検知
  useEffect(() => {
    const currentData = JSON.stringify(data);
    if (currentData !== previousDataRef.current) {
      previousDataRef.current = currentData;
      hasUnsavedChangesRef.current = true;
    }
  }, [data]);

  return {
    ...autoSave,
    hasUnsavedChanges: hasUnsavedChangesRef.current,
  };
}
