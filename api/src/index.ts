import express from 'express';
import { connectRedis } from './cache/redis';
import authRouter from './routes/auth';
import studentsRouter from './routes/students';
import menuRouter from './routes/menu';
import ratingsRouter from './routes/ratings';
import { startMenuPoller } from './services/menuService';
import { startRecencyWorker } from './workers/recencyWorker';

const app = express();

app.use(express.json());

app.use('/api/auth', authRouter);
app.use('/api/students', studentsRouter);
app.use('/api', menuRouter);
app.use('/api/ratings', ratingsRouter);

const PORT = process.env.PORT ?? 3000;

connectRedis()
  .then(() => {
    startMenuPoller();
    startRecencyWorker();
    app.listen(PORT, () => {
      console.log(`API server listening on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to connect to Redis:', err);
    process.exit(1);
  });

export default app;
