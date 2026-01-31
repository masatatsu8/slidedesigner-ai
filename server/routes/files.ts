import { Router, Request, Response } from 'express';
import * as fileService from '../services/fileService';

const router = Router();

/**
 * POST /api/files/save
 * 画像をローカルファイルとして保存
 */
router.post('/save', (req: Request, res: Response) => {
  try {
    const { projectId, sessionId, base64Data, filename } = req.body;

    if (!projectId || !sessionId || !base64Data) {
      res.status(400).json({
        error: 'Missing required fields: projectId, sessionId, base64Data',
      });
      return;
    }

    const result = fileService.saveImage({
      projectId,
      sessionId,
      base64Data,
      filename,
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Failed to save image:', error);
    res.status(500).json({
      error: 'Failed to save image',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/files/:projectId/:sessionId
 * セッションの画像一覧を取得
 */
router.get('/:projectId/:sessionId', (req: Request, res: Response) => {
  try {
    const { projectId, sessionId } = req.params;

    const images = fileService.getImagesForSession(projectId, sessionId);

    res.json({
      success: true,
      data: images,
    });
  } catch (error) {
    console.error('Failed to get images:', error);
    res.status(500).json({
      error: 'Failed to get images',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/files/:projectId/:sessionId/:filename
 * 画像ファイルを取得 (バイナリ)
 */
router.get('/:projectId/:sessionId/:filename', (req: Request, res: Response) => {
  try {
    const { projectId, sessionId, filename } = req.params;

    const filePath = fileService.getImagePath(projectId, sessionId, filename);

    if (!filePath) {
      res.status(404).json({
        error: 'Image not found',
      });
      return;
    }

    res.sendFile(filePath);
  } catch (error) {
    console.error('Failed to get image:', error);
    res.status(500).json({
      error: 'Failed to get image',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/files/:projectId/:sessionId/:filename/base64
 * 画像をBase64として取得
 */
router.get('/:projectId/:sessionId/:filename/base64', (req: Request, res: Response) => {
  try {
    const { projectId, sessionId, filename } = req.params;

    const base64Data = fileService.getImageAsBase64(projectId, sessionId, filename);

    if (!base64Data) {
      res.status(404).json({
        error: 'Image not found',
      });
      return;
    }

    res.json({
      success: true,
      data: {
        filename,
        base64Data,
      },
    });
  } catch (error) {
    console.error('Failed to get image as base64:', error);
    res.status(500).json({
      error: 'Failed to get image as base64',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * DELETE /api/files/:projectId/:sessionId/:filename
 * 画像を削除
 */
router.delete('/:projectId/:sessionId/:filename', (req: Request, res: Response) => {
  try {
    const { projectId, sessionId, filename } = req.params;

    const deleted = fileService.deleteImage(projectId, sessionId, filename);

    if (!deleted) {
      res.status(404).json({
        error: 'Image not found',
      });
      return;
    }

    res.json({
      success: true,
      message: 'Image deleted successfully',
    });
  } catch (error) {
    console.error('Failed to delete image:', error);
    res.status(500).json({
      error: 'Failed to delete image',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/files/project/:projectId
 * プロジェクト内の全画像を取得
 */
router.get('/project/:projectId', (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;

    const result = fileService.getImagesForProject(projectId);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Failed to get project images:', error);
    res.status(500).json({
      error: 'Failed to get project images',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/files/info
 * ベースディレクトリ情報を取得
 */
router.get('/info', (_req: Request, res: Response) => {
  try {
    res.json({
      success: true,
      data: {
        basePath: fileService.getBasePath(),
      },
    });
  } catch (error) {
    console.error('Failed to get info:', error);
    res.status(500).json({
      error: 'Failed to get info',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
