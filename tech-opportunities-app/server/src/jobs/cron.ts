import { clearCache } from '../utils/cache';
import Job from '../models/job';
import { scrapeBrightNetwork } from '../scrapers/brightNetwork';
import { scrapeRateMyPlacement } from '../scrapers/rateMyPlacement';
import { scrapeGradcracker } from '../scrapers/gradcracker';
import { scrapeLinkedIn } from '../scrapers/linkedin';
import { scrapeIndeed } from '../scrapers/indeed';
import mongoose from 'mongoose';
import { createClient, RedisClientType } from 'redis';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/**
 * Run all scrapers and save jobs to the database
 */
export const runScrapers = async (): Promise<void> => {
  console.log('Starting job scraping...');
  let redisClient = null;
  
  try {
    // Connect to MongoDB if not already connected
    if (mongoose.connection.readyState !== 1) {
      const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/tech-internships';
      try {
        await mongoose.connect(mongoUri, {
          serverSelectionTimeoutMS: 5000 // 5 second timeout
        });
        console.log('Connected to MongoDB for scraping');
      } catch (error) {
        console.error('Failed to connect to primary MongoDB server, trying fallback if available');
        
        // If you have a fallback MongoDB instance, you can try connecting to it here
        // For now, we'll just re-throw the error
        throw error;
      }
    }
    
    // Connect to Redis if needed for cache clearing
    try {
      redisClient = createClient({
        url: process.env.REDIS_URL || 'redis://localhost:6379'
      });
      
      redisClient.on('error', (err) => console.warn('Redis Client Warning:', err));
      
      await redisClient.connect();
      console.log('Connected to Redis for cache clearing');
    } catch (redisError) {
      console.warn('Redis connection failed, will continue without cache clearing:', redisError);
      // Continue without Redis - it's non-critical
      redisClient = null;
    }
    
    // Run all scrapers in parallel
    console.log('Starting scrapers...');
    const scrapingPromises = [
      runScraper('Bright Network', scrapeBrightNetwork),
      runScraper('Rate My Placement', scrapeRateMyPlacement),
      runScraper('Gradcracker', scrapeGradcracker),
      runScraper('LinkedIn', scrapeLinkedIn),
      runScraper('Indeed', scrapeIndeed)
    ];
    
    const scrapedJobsArrays = await Promise.allSettled(scrapingPromises);
    
    // Process results from each scraper
    let totalJobsAdded = 0;
    let failedScrapers = 0;
    
    for (const result of scrapedJobsArrays) {
      if (result.status === 'fulfilled' && result.value.length > 0) {
        const jobs = result.value;
        
        // Save jobs to database (skip duplicates based on URL)
        for (const job of jobs) {
          try {
            // Check if job already exists by URL
            const existingJob = await Job.findOne({ url: job.url });
            
            if (!existingJob) {
              const newJob = new Job(job);
              await newJob.save();
              totalJobsAdded++;
            }
          } catch (error) {
            console.error(`Error saving job: ${job.title}`, error);
          }
        }
      } else if (result.status === 'rejected') {
        console.error('Scraper failed:', result.reason);
        failedScrapers++;
      }
    }
    
    console.log(`Scraping completed. Added ${totalJobsAdded} new jobs. Failed scrapers: ${failedScrapers}`);
    
    // Clear cache to ensure fresh data is served
    if (redisClient) {
      try {
        await clearCache(redisClient as RedisClientType);
        console.log('Cache cleared successfully');
      } catch (cacheError) {
        console.error('Failed to clear cache:', cacheError);
      }
    }
  } catch (error) {
    console.error('Error during job scraping:', error);
  } finally {
    // Close Redis connection
    if (redisClient) {
      try {
        await redisClient.quit();
      } catch (error) {
        console.error('Error closing Redis connection:', error);
      }
    }
    
    // Don't close MongoDB connection here as it might be used by the main app
  }
};

/**
 * Helper function to run a scraper with error handling
 */
async function runScraper(scraperName: string, scraperFn: () => Promise<any[]>): Promise<any[]> {
  try {
    console.log(`Starting ${scraperName} scraper...`);
    const startTime = Date.now();
    const jobs = await scraperFn();
    const duration = (Date.now() - startTime) / 1000;
    console.log(`${scraperName} scraper completed in ${duration.toFixed(2)}s. Found ${jobs.length} jobs.`);
    return jobs;
  } catch (error) {
    console.error(`Error in ${scraperName} scraper:`, error);
    return [];
  }
}

// If this file is run directly, execute the scraping
if (require.main === module) {
  runScrapers()
    .then(() => {
      console.log('Scraping completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Scraping failed:', error);
      process.exit(1);
    });
}
