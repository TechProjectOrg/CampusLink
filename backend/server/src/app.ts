import express, { Application, Request, Response } from 'express';
import authRouter from './routes/auth';
import usersRouter from './routes/users';
import postsRouter from './routes/posts';
import searchRouter from './routes/search';
import networkRouter from './routes/network';
import notificationsRouter from './routes/notifications';
import chatRouter from './routes/chat';
import clubsRouter from './routes/clubs';
import groupChatRouter from './routes/groupChat';
import adminRouter from './routes/admin';
import moderationRouter from './routes/moderation';
import cors from 'cors';
import { buildHealthReport, type RouteDescriptor, type StaticRouteDescriptor } from './lib/health';

const app: Application = express();

function normalizeOrigin(origin: string): string {
  return origin.trim().replace(/\/+$/, '').toLowerCase();
}

function sanitizeOrigin(origin: string): string {
  return origin.trim().replace(/^['\"]|['\"]$/g, '');
}

const allowedOrigins = new Set(
  [
    'http://localhost:3000',
    'http://localhost:5173',
    ...(process.env.CORS_ORIGINS ?? '').split(',').map((origin) => sanitizeOrigin(origin)),
  ]
    .filter(Boolean)
    .map(normalizeOrigin)
);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.has(normalizeOrigin(origin))) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
  })
);

app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

const apiRouteDescriptors: RouteDescriptor[] = [
  {
    module: 'auth',
    prefix: '/auth',
    router: authRouter,
    requiredDependencies: ['database'],
  },
  {
    module: 'posts',
    prefix: '/',
    router: postsRouter,
    requiredDependencies: ['database'],
  },
  {
    module: 'users',
    prefix: '/users',
    router: usersRouter,
    requiredDependencies: ['database'],
  },
  {
    module: 'search',
    prefix: '/search',
    router: searchRouter,
    requiredDependencies: ['database'],
  },
  {
    module: 'network',
    prefix: '/network',
    router: networkRouter,
    requiredDependencies: ['database'],
    optionalDependencies: ['redis'],
  },
  {
    module: 'notifications',
    prefix: '/notifications',
    router: notificationsRouter,
    requiredDependencies: ['database'],
  },
  {
    module: 'chat',
    prefix: '/chat',
    router: chatRouter,
    requiredDependencies: ['database'],
    optionalDependencies: ['redis'],
  },
  {
    module: 'clubs',
    prefix: '/clubs',
    router: clubsRouter,
    requiredDependencies: ['database'],
  },
  {
    module: 'group-chat',
    prefix: '/group-chat',
    router: groupChatRouter,
    requiredDependencies: ['database'],
    optionalDependencies: ['redis'],
  },
  {
    module: 'admin',
    prefix: '/admin',
    router: adminRouter,
    requiredDependencies: ['database'],
    optionalDependencies: ['redis'],
  },
  {
    module: 'moderation',
    prefix: '/moderation',
    router: moderationRouter,
    requiredDependencies: ['database'],
    optionalDependencies: ['redis'],
  },
];

const staticHealthRoutes: StaticRouteDescriptor[] = [
  {
    method: 'GET',
    path: '/health',
    module: 'system',
    requiredDependencies: ['database'],
  },
];

app.get('/health', async (_req: Request, res: Response) => {
  const report = await buildHealthReport(apiRouteDescriptors, staticHealthRoutes);

  res.status(report.status === 'unavailable' ? 503 : 200).json(report);
});

app.use('/auth', authRouter);
app.use('/', postsRouter);
app.use('/users', usersRouter);
app.use('/search', searchRouter);
app.use('/network', networkRouter);
app.use('/notifications', notificationsRouter);
app.use('/chat', chatRouter);
app.use('/clubs', clubsRouter);
app.use('/group-chat', groupChatRouter);
app.use('/admin', adminRouter);
app.use('/moderation', moderationRouter);

export default app;
