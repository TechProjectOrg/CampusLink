import express, { Application, Request, Response } from 'express';
import prisma from './prisma';
import authRouter from './routes/auth';
import usersRouter from './routes/users';
import postsRouter from './routes/posts';
import searchRouter from './routes/search';
import networkRouter from './routes/network';
import notificationsRouter from './routes/notifications';
import chatRouter from './routes/chat';
import cors from 'cors';

const app: Application = express();

app.use(
  cors({
    origin: ['http://localhost:3000', 'http://localhost:5173'],
  })
);

app.use(express.json());

app.get('/health', async (_req: Request, res: Response) => {
  try {
    // Simple DB check; if this fails, Prisma/PostgreSQL is not reachable
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({ status: 'ok', db: 'up' });
  } catch (err: any) {
    console.error('Health check failed:', err);
    res.status(500).json({ 
      status: 'error', 
      db: 'down',
      errorName: err?.name || 'UnknownError',
      errorMessage: err?.message || String(err),
      errorCode: err?.code
    });
  }
});

app.use('/auth', authRouter);
app.use('/', postsRouter);
app.use('/users', usersRouter);
app.use('/search', searchRouter);
app.use('/network', networkRouter);
app.use('/notifications', notificationsRouter);
app.use('/chat', chatRouter);

export default app;
