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
 * Scrape internship listings from RateMyPlacement
 * @returns Array of scraped jobs
 */
export async function scrapeRateMyPlacement(): Promise<ScrapedJob[]> {
  console.log('Starting RateMyPlacement scraper...');
  const jobs: ScrapedJob[] = [];
  const browser = await chromium.launch({ headless: true });
  
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    
    // Navigate to the internships page
    await page.goto('https://www.ratemyplacement.co.uk/search?show=jobs&location=london&seo=internships&type=internship&industry=it-technology', {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    
    // Wait for job listings to load
    await page.waitForSelector('.search-result', { timeout: 10000 });
    
    // Extract job listings
    const jobListings = await page.$$('.search-result');
    
    for (const listing of jobListings) {
      try {
        // Extract job details
        const titleElement = await listing.$('.search-result__title');
        const companyElement = await listing.$('.search-result__company-name');
        const locationElement = await listing.$('.search-result__location');
        const linkElement = await listing.$('a.search-result__title');
        
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
        const descriptionElement = await detailsPage.$('.job-description');
        const description = descriptionElement ? await descriptionElement.textContent() || '' : '';
        
        // Try to extract posted date, default to current date if not found
        let postedDate = new Date();
        const dateElement = await detailsPage.$('.job-info__date');
        if (dateElement) {
          const dateText = await dateElement.textContent() || '';
          const dateMatch = dateText.match(/(\d{1,2})[a-z]{2}\s+([A-Za-z]+)\s+(\d{4})/);
          if (dateMatch) {
            const [_, day, month, year] = dateMatch;
            const monthMap: Record<string, number> = {
              'January': 0, 'February': 1, 'March': 2, 'April': 3, 'May': 4, 'June': 5,
              'July': 6, 'August': 7, 'September': 8, 'October': 9, 'November': 10, 'December': 11
            };
            postedDate = new Date(parseInt(year), monthMap[month], parseInt(day));
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
          source: 'RateMyPlacement',
        });
        
        // Close the details page
        await detailsPage.close();
        
        // Respect robots.txt with a delay between requests
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (error) {
        console.error('Error processing RateMyPlacement job listing:', error);
      }
    }
    
    console.log(`RateMyPlacement scraper completed. Found ${jobs.length} jobs.`);
    return jobs;
  } catch (error) {
    console.error('Error in RateMyPlacement scraper:', error);
    return jobs;
  } finally {
    await browser.close();
  }
}
