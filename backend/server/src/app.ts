import express, { Application, Request, Response } from 'express';
import prisma from './prisma';
import authRouter from './routes/auth';
import usersRouter from './routes/users';
import postsRouter from './routes/posts';
import searchRouter from './routes/search';
import networkRouter from './routes/network';
import notificationsRouter from './routes/notifications';
import cors from 'cors';

const app: Application = express();

app.use(
  cors({
    origin: ['http://localhost:3000', 'http://localhost:5173'],
  })
);

app.use(express.json());

app.use('/auth', authRouter);
app.use('/', postsRouter);
app.use('/users', usersRouter);
app.use('/search', searchRouter);
app.use('/network', networkRouter);
app.use('/notifications', notificationsRouter);

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
