import { chromium } from 'playwright';

interface ScrapedJob {
  title: string;
  company: string;
  location: string;
  url: string;
  description: string;
  postedDate: Date;
  source: string;
}

/**
 * Scrape internship listings from LinkedIn
 * @returns Array of scraped jobs
 */
export async function scrapeLinkedIn(): Promise<ScrapedJob[]> {
  console.log('Starting LinkedIn scraper...');
  const jobs: ScrapedJob[] = [];
  const browser = await chromium.launch({ headless: true });
  
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    
    // Navigate to the internships page
    await page.goto('https://www.linkedin.com/jobs/search/?keywords=internship%20technology&location=London%2C%20England%2C%20United%20Kingdom&f_TPR=&f_JT=I', {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    
    // Wait for job listings to load
    await page.waitForSelector('.jobs-search__results-list', { timeout: 10000 });
    
    // Extract job listings
    const jobListings = await page.$$('.jobs-search__results-list > li');
    
    for (const listing of jobListings.slice(0, 10)) { // Limit to 10 jobs to avoid rate limiting
      try {
        // Extract job details
        const titleElement = await listing.$('.base-search-card__title');
        const companyElement = await listing.$('.base-search-card__subtitle');
        const locationElement = await listing.$('.job-search-card__location');
        const linkElement = await listing.$('a.base-card__full-link');
        
        if (!titleElement || !companyElement || !linkElement) continue;
        
        const title = await titleElement.textContent() || '';
        const company = await companyElement.textContent() || '';
        const location = locationElement ? (await locationElement.textContent() || 'London') : 'London';
        const url = await linkElement.getAttribute('href') || '';
        
        // Only proceed if we have the essential information
        if (!title.trim() || !company.trim() || !url.trim()) continue;
        
        // Navigate to the job details page to get the description
        const detailsPage = await context.newPage();
        await detailsPage.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        
        // Extract description
        const descriptionElement = await detailsPage.$('.description__text');
        const description = descriptionElement ? await descriptionElement.textContent() || '' : '';
        
        // Try to extract posted date, default to current date if not found
        let postedDate = new Date();
        const dateElement = await detailsPage.$('.posted-time-ago__text');
        if (dateElement) {
          const dateText = await dateElement.textContent() || '';
          // Parse relative dates like "Posted 2 days ago" or "Posted 3 weeks ago"
          if (dateText.includes('day')) {
            const days = parseInt(dateText.match(/(\d+)\s+day/)?.[1] || '0');
            postedDate = new Date();
            postedDate.setDate(postedDate.getDate() - days);
          } else if (dateText.includes('week')) {
            const weeks = parseInt(dateText.match(/(\d+)\s+week/)?.[1] || '0');
            postedDate = new Date();
            postedDate.setDate(postedDate.getDate() - (weeks * 7));
          } else if (dateText.includes('month')) {
            const months = parseInt(dateText.match(/(\d+)\s+month/)?.[1] || '0');
            postedDate = new Date();
            postedDate.setMonth(postedDate.getMonth() - months);
          }
        }
        
        // Add job to the list
        jobs.push({
          title: title.trim(),
          company: company.trim(),
          location: location.includes('London') ? 'London' : `${location.trim()}, London`,
          url,
          description: description.trim(),
          postedDate,
          source: 'LinkedIn',
        });
        
        // Close the details page
        await detailsPage.close();
        
        // Respect robots.txt with a delay between requests
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (error) {
        console.error('Error processing LinkedIn job listing:', error);
      }
    }
    
    console.log(`LinkedIn scraper completed. Found ${jobs.length} jobs.`);
    return jobs;
  } catch (error) {
    console.error('Error in LinkedIn scraper:', error);
    return jobs;
  } finally {
    await browser.close();
  }
}
