import 'dotenv/config';
import express from 'express';
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
import gamificationRouter from './routes/gamification';
import mealPlanningRouter from './routes/mealPlanning';
import { startMenuPoller } from './services/menuService';

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
app.use('/api', gamificationRouter);
app.use('/api', mealPlanningRouter);

const PORT = process.env.PORT ?? 3000;

startMenuPoller();

app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`API server listening on http://localhost:${PORT}`);
});

export default app;
