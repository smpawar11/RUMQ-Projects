import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import cron from 'node-cron';
import { createClient } from 'redis';
import jobRoutes from './routes/jobs';
import { runScrapers } from './jobs/cron';
import Job from './models/job';

// Load environment variables
dotenv.config();

// Create Express app
const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/tech-internships')
  .then(async () => {
    console.log('Connected to MongoDB');
    
    // Check if there are jobs in the database
    const jobCount = await Job.countDocuments();
    console.log(`Found ${jobCount} jobs in database`);
    
    // If no jobs found, run scrapers to populate the database
    if (jobCount === 0) {
      console.log('No jobs found in database. Running scrapers to populate data...');
      try {
        await runScrapers();
        const newJobCount = await Job.countDocuments();
        console.log(`Database populated with ${newJobCount} jobs`);
      } catch (error) {
        console.error('Failed to populate database with jobs:', error);
      }
    }
  })
  .catch((error) => {
    console.error('MongoDB connection error:', error);
  });

// Initialize Redis client with more robust error handling
let redisClient = null;
try {
  redisClient = createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6379'
  });

  redisClient.on('error', (err) => {
    console.warn('Redis Client Warning:', err);
  });

  // Connect to Redis
  (async () => {
    try {
      await redisClient.connect();
      console.log('Connected to Redis');
    } catch (error) {
      console.error('Redis connection error:', error);
      console.log('Will continue without Redis - search caching will be disabled');
      redisClient = null;
    }
  })();
} catch (error) {
  console.warn('Failed to initialize Redis client:', error);
  console.log('Will continue without Redis - search caching will be disabled');
}

// Make Redis client available to routes
app.set('redisClient', redisClient);

// Routes
app.use('/api/jobs', jobRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// API info endpoint
app.get('/', (req, res) => {
  res.status(200).json({ 
    name: 'London Tech Internship Finder API',
    version: '1.0.0',
    endpoints: [
      { path: '/api/jobs', method: 'GET', description: 'Get all jobs' },
      { path: '/api/jobs/search', method: 'GET', description: 'Search jobs by keyword and location' },
      { path: '/api/jobs/save', method: 'POST', description: 'Save a job' },
      { path: '/api/jobs/saved', method: 'GET', description: 'Get saved jobs' },
      { path: '/health', method: 'GET', description: 'Health check' }
    ]
  });
});

// Schedule job scraping
const cronSchedule = process.env.CRON_SCHEDULE || '0 0 * * *'; // Default: every day at midnight
cron.schedule(cronSchedule, async () => {
  console.log('Running scheduled job scraping...');
  try {
    await runScrapers();
    console.log('Job scraping completed successfully');
  } catch (error) {
    console.error('Error during scheduled job scraping:', error);
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`API available at http://localhost:${PORT}/api/jobs`);
});

// Handle graceful shutdown
process.on('SIGINT', async () => {
  try {
    if (redisClient) {
      await redisClient.quit();
    }
    await mongoose.connection.close();
    console.log('Gracefully shutting down');
    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
});

export default app;
