import { createClient, RedisClientType } from 'redis';
import crypto from 'crypto';

// Default cache TTL in seconds (1 hour)
const DEFAULT_CACHE_TTL = 3600;

/**
 * Generate a hash key from the query parameters
 * @param params Query parameters
 * @returns Hashed string
 */
export const generateCacheKey = (params: Record<string, any>): string => {
  const sortedParams = Object.keys(params)
    .sort()
    .reduce((result: Record<string, any>, key) => {
      if (params[key] !== undefined && params[key] !== null && params[key] !== '') {
        result[key] = params[key];
      }
      return result;
    }, {});

  const stringifiedParams = JSON.stringify(sortedParams);
  return crypto.createHash('md5').update(stringifiedParams).digest('hex');
};

/**
 * Get data from cache
 * @param redisClient Redis client
 * @param key Cache key
 * @returns Cached data or null if not found
 */
export const getCache = async <T>(
  redisClient: RedisClientType | null | undefined,
  key: string
): Promise<T | null> => {
  try {
    if (!redisClient) {
      return null;
    }
    
    // Check if client is connected
    if (!(redisClient as any).isOpen) {
      console.warn('Redis client is not connected. Skipping cache get.');
      return null;
    }
    
    const cachedData = await redisClient.get(`jobs:${key}`);
    if (cachedData) {
      return JSON.parse(cachedData) as T;
    }
    return null;
  } catch (error) {
    console.error('Redis get error:', error);
    return null;
  }
};

/**
 * Set data in cache
 * @param redisClient Redis client
 * @param key Cache key
 * @param data Data to cache
 * @param ttl Time to live in seconds
 */
export const setCache = async <T>(
  redisClient: RedisClientType | null | undefined,
  key: string,
  data: T,
  ttl: number = DEFAULT_CACHE_TTL
): Promise<void> => {
  try {
    if (!redisClient) {
      return;
    }
    
    // Check if client is connected
    if (!(redisClient as any).isOpen) {
      console.warn('Redis client is not connected. Skipping cache set.');
      return;
    }
    
    await redisClient.set(`jobs:${key}`, JSON.stringify(data), {
      EX: ttl,
    });
  } catch (error) {
    console.error('Redis set error:', error);
  }
};

/**
 * Clear cache for a specific key or pattern
 * @param redisClient Redis client
 * @param pattern Key pattern to clear
 */
export const clearCache = async (
  redisClient: RedisClientType | null | undefined,
  pattern: string = 'jobs:*'
): Promise<void> => {
  try {
    if (!redisClient) {
      return;
    }
    
    // Check if client is connected
    if (!(redisClient as any).isOpen) {
      console.warn('Redis client is not connected. Skipping cache clear.');
      return;
    }
    
    const keys = await redisClient.keys(pattern);
    if (keys.length > 0) {
      await redisClient.del(keys);
    }
  } catch (error) {
    console.error('Redis clear cache error:', error);
  }
};
