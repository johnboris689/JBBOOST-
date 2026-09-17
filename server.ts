import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { initDatabaseAndSeed } from './server/seed.ts';
import { authRouter } from './server/routes/auth.ts';
import { servicesRouter } from './server/routes/services.ts';
import { ordersRouter } from './server/routes/orders.ts';
import { walletRouter } from './server/routes/wallet.ts';
import { adminRouter } from './server/routes/admin.ts';
import { smmApiRouter } from './server/routes/smmApi.ts';

const PORT = Number(process.env.PORT) || 10000;

async function startServer() {
  const app = express();

  // Basic security and parsing middleware
  app.use(cors({
    origin: true,
    credentials: true,
  }));
  app.use(express.json({ verify: (req: any, _res, buf) => { req.rawBody = buf.toString('utf8'); } }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  // Initialize SQLite database and seed initial admin & services catalog
  try {
    await initDatabaseAndSeed();
  } catch (dbErr) {
    console.error('Failed to initialize database:', dbErr);
  }

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'SMM Boost Panel API',
      timestamp: new Date().toISOString(),
    });
  });

  // Mount API Routers
  app.use('/api/auth', authRouter);
  app.use('/api/services', servicesRouter);
  app.use('/api/orders', ordersRouter);
  app.use('/api/wallet', walletRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/v1/smm', smmApiRouter);

  // Vite middleware for development / Static files for production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[JB BOOST] Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
