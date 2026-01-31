import express from 'express';
import cors from 'cors';
import filesRouter from './routes/files';

const app = express();
const PORT = process.env.PORT || 4101;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Routes
app.use('/api/files', filesRouter);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

// Error handling middleware
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Server error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message,
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`[InfographAI Server] Running on http://localhost:${PORT}`);
  console.log(`[InfographAI Server] API endpoints:`);
  console.log(`  - POST   /api/files/save`);
  console.log(`  - GET    /api/files/:projectId/:sessionId`);
  console.log(`  - GET    /api/files/:projectId/:sessionId/:filename`);
  console.log(`  - DELETE /api/files/:projectId/:sessionId/:filename`);
  console.log(`  - GET    /api/files/info`);
  console.log(`  - GET    /api/health`);
});

export default app;
