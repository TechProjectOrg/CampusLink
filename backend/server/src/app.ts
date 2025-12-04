import express, { Application, Request, Response } from 'express';
import prisma from './prisma';

const app: Application = express();

app.use(express.json());

app.get('/health', async (_req: Request, res: Response) => {
  try {
    // Simple DB check; if this fails, Prisma/PostgreSQL is not reachable
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({ status: 'ok', db: 'up' });
  } catch (err) {
    console.error('Health check failed:', err);
    res.status(500).json({ status: 'error', db: 'down' });
  }
});

export default app;
