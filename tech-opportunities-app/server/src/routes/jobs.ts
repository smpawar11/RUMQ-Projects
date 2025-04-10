import express, { Request, Response } from 'express';
import { RedisClientType } from 'redis';
import Job from '../models/job';
import SavedJob from '../models/savedJob';
import { generateCacheKey, getCache, setCache } from '../utils/cache';

const router = express.Router();

// Get all jobs
router.get('/', async (req: Request, res: Response) => {
  try {
    const jobs = await Job.find().sort({ postedDate: -1 }).limit(100);
    res.status(200).json(jobs);
  } catch (error) {
    console.error('Error fetching jobs:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Search jobs with caching
router.get('/search', async (req: Request, res: Response) => {
  try {
    const { keyword, location } = req.query;
    const redisClient = req.app.get('redisClient') as RedisClientType;
    
    // Generate cache key from query parameters
    const cacheKey = generateCacheKey({ keyword, location });
    
    // Try to get data from cache
    const cachedJobs = await getCache<any[]>(redisClient, cacheKey);
    if (cachedJobs) {
      console.log(`[SEARCH] Returning ${cachedJobs.length} cached jobs for query:`, { keyword, location });
      return res.status(200).json(cachedJobs);
    }
    
    // Build query
    let query: any = {};
    
    // Process location filter
    if (location && typeof location === 'string') {
      query.location = { $regex: new RegExp(location, 'i') };
    }
    
    // Process keyword filter - use regex as a fallback if text search doesn't work
    if (keyword && typeof keyword === 'string') {
      // Try text search first (uses index)
      query.$or = [
        { $text: { $search: keyword } },
        { title: { $regex: new RegExp(keyword, 'i') } },
        { company: { $regex: new RegExp(keyword, 'i') } },
        { description: { $regex: new RegExp(keyword, 'i') } }
      ];
    }
    
    console.log('[SEARCH] Running query with params:', { keyword, location });
    
    // Execute query
    const jobs = await Job.find(query)
      .sort({ postedDate: -1 })
      .limit(100);
    
    console.log(`[SEARCH] Found ${jobs.length} jobs matching query:`, { keyword, location });
    
    // Cache results
    await setCache(redisClient, cacheKey, jobs);
    
    res.status(200).json(jobs);
  } catch (error) {
    console.error('Error searching jobs:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Save a job
router.post('/save', async (req: Request, res: Response) => {
  try {
    const { jobId } = req.body;
    
    if (!jobId) {
      return res.status(400).json({ message: 'Job ID is required' });
    }
    
    // Use a session ID from cookies or generate one
    // In a real app, this would be a user ID from authentication
    const userSession = req.headers['x-session-id'] as string || 'anonymous-user';
    
    // Check if job exists
    const job = await Job.findById(jobId);
    if (!job) {
      return res.status(404).json({ message: 'Job not found' });
    }
    
    // Check if already saved
    const existingSave = await SavedJob.findOne({ userSession, jobId });
    if (existingSave) {
      return res.status(400).json({ message: 'Job already saved' });
    }
    
    // Save the job
    const savedJob = new SavedJob({
      userSession,
      jobId,
    });
    
    await savedJob.save();
    
    res.status(201).json({ message: 'Job saved successfully' });
  } catch (error) {
    console.error('Error saving job:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get saved jobs
router.get('/saved', async (req: Request, res: Response) => {
  try {
    // Use a session ID from cookies or generate one
    const userSession = req.headers['x-session-id'] as string || 'anonymous-user';
    
    // Find saved job IDs
    const savedJobs = await SavedJob.find({ userSession });
    const jobIds = savedJobs.map(saved => saved.jobId);
    
    // Get the actual job details
    const jobs = await Job.find({ _id: { $in: jobIds } });
    
    res.status(200).json(jobs);
  } catch (error) {
    console.error('Error fetching saved jobs:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Remove a saved job
router.delete('/saved/:jobId', async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    const userSession = req.headers['x-session-id'] as string || 'anonymous-user';
    
    const result = await SavedJob.deleteOne({ userSession, jobId });
    
    if (result.deletedCount === 0) {
      return res.status(404).json({ message: 'Saved job not found' });
    }
    
    res.status(200).json({ message: 'Job removed from saved list' });
  } catch (error) {
    console.error('Error removing saved job:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
