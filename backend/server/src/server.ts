import 'dotenv/config';
import { createServer } from 'http';
import app from './app';
import { maybeStartChatCacheReconciler } from './lib/chatCache';
import { initializeRealtimeServer } from './lib/realtime';
import { maybeStartSocialInsightsSchedulers } from './lib/socialInsights';

const PORT = process.env.PORT || 4000;
const server = createServer(app);

initializeRealtimeServer(server);
void maybeStartChatCacheReconciler();
maybeStartSocialInsightsSchedulers();

server.listen(PORT, () => {
  console.log(`Backend server listening on port ${PORT}`);
});
