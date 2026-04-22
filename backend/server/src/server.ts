import 'dotenv/config';
import { createServer } from 'http';
import app from './app';
import { initializeRealtimeServer } from './lib/realtime';

const PORT = process.env.PORT || 4000;
const server = createServer(app);

initializeRealtimeServer(server);

server.listen(PORT, () => {
  console.log(`Backend server listening on port ${PORT}`);
});
