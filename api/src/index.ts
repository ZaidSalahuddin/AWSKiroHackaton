import express from 'express';
import { connectRedis } from './cache/redis';
import authRouter from './routes/auth';
import studentsRouter from './routes/students';
import menuRouter from './routes/menu';
import ratingsRouter from './routes/ratings';
import trendingRouter from './routes/trending';
import nutritionRouter from './routes/nutrition';
import { startMenuPoller } from './services/menuService';
import { startRecencyWorker } from './workers/recencyWorker';
import { startTrendingWorker } from './workers/trendingWorker';

const app = express();

app.use(express.json());

app.use('/api/auth', authRouter);
app.use('/api/students', studentsRouter);
app.use('/api', menuRouter);
app.use('/api/ratings', ratingsRouter);
app.use('/api', trendingRouter);
app.use('/api', nutritionRouter);

const PORT = process.env.PORT ?? 3000;

connectRedis()
  .then(() => {
    startMenuPoller();
    startRecencyWorker();
    startTrendingWorker();
    app.listen(PORT, () => {
      console.log(`API server listening on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to connect to Redis:', err);
    process.exit(1);
  });

export default app;
