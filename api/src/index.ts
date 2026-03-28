import express from 'express';
import { connectRedis } from './cache/redis';
import authRouter from './routes/auth';
import studentsRouter from './routes/students';
import menuRouter from './routes/menu';
import ratingsRouter from './routes/ratings';
import trendingRouter from './routes/trending';
import nutritionRouter from './routes/nutrition';
import waitTimeRouter from './routes/waitTime';
import weatherRouter from './routes/weather';
import recommendationsRouter from './routes/recommendations';
import socialRouter from './routes/social';
import photoReviewRouter from './routes/photoReview';
import gamificationRouter from './routes/gamification';
import mealPlanningRouter from './routes/mealPlanning';
import hokiePassportRouter from './routes/hokiePassport';
import eventSpecialsRouter from './routes/eventSpecials';
import { startMenuPoller } from './services/menuService';
import { startRecencyWorker } from './workers/recencyWorker';
import { startTrendingWorker } from './workers/trendingWorker';
import { startWeatherPoller } from './services/weatherService';

const app = express();

app.use(express.json());

app.use('/api/auth', authRouter);
app.use('/api/students', studentsRouter);
app.use('/api', menuRouter);
app.use('/api/ratings', ratingsRouter);
app.use('/api', trendingRouter);
app.use('/api', nutritionRouter);
app.use('/api', waitTimeRouter);
app.use('/api', weatherRouter);
app.use('/api', recommendationsRouter);
app.use('/api', socialRouter);
app.use('/api', photoReviewRouter);
app.use('/api', gamificationRouter);
app.use('/api', mealPlanningRouter);
app.use('/api', hokiePassportRouter);
app.use('/api', eventSpecialsRouter);

const PORT = process.env.PORT ?? 3000;

connectRedis()
  .then(() => {
    startMenuPoller();
    startRecencyWorker();
    startTrendingWorker();
    startWeatherPoller();
    app.listen(PORT, () => {
      console.log(`API server listening on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to connect to Redis:', err);
    process.exit(1);
  });

export default app;
