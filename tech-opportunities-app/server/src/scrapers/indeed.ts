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
 * Scrape internship listings from Indeed
 * @returns Array of scraped jobs
 */
export async function scrapeIndeed(): Promise<ScrapedJob[]> {
  console.log('Starting Indeed scraper...');
  const jobs: ScrapedJob[] = [];
  const browser = await chromium.launch({ headless: true });
  
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    
    // Navigate to the internships page
    await page.goto('https://uk.indeed.com/jobs?q=technology+internship&l=London%2C+Greater+London&sc=0kf%3Ajt%28internship%29%3B', {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    
    // Wait for job listings to load
    await page.waitForSelector('.jobsearch-ResultsList', { timeout: 10000 });
    
    // Extract job listings
    const jobListings = await page.$$('.job_seen_beacon');
    
    for (const listing of jobListings.slice(0, 15)) { // Limit to 15 jobs to avoid rate limiting
      try {
        // Extract job details
        const titleElement = await listing.$('.jobTitle a');
        const companyElement = await listing.$('.companyName');
        const locationElement = await listing.$('.companyLocation');
        
        if (!titleElement || !companyElement) continue;
        
        const title = await titleElement.textContent() || '';
        const company = await companyElement.textContent() || '';
        const location = locationElement ? (await locationElement.textContent() || 'London') : 'London';
        
        // Get the job URL
        const jobId = await titleElement.getAttribute('data-jk') || '';
        const idAttr = await titleElement.getAttribute('id');
        const processedJobId = jobId || (idAttr ? idAttr.replace('jobTitle-', '') : '');
        
        if (!processedJobId) {
          const href = await titleElement.getAttribute('href') || '';
          if (!href) continue;
        }
        
        const url = processedJobId ? `https://uk.indeed.com/viewjob?jk=${processedJobId}` : 
                  `https://uk.indeed.com${await titleElement.getAttribute('href')}`;
        
        // Only proceed if we have the essential information
        if (!title.trim() || !company.trim() || !url.trim()) continue;
        
        // Navigate to the job details page to get the description
        const detailsPage = await context.newPage();
        await detailsPage.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        
        // Extract description
        const descriptionElement = await detailsPage.$('#jobDescriptionText');
        const description = descriptionElement ? await descriptionElement.textContent() || '' : '';
        
        // Try to extract posted date, default to current date if not found
        let postedDate = new Date();
        const dateElement = await detailsPage.$('.jobsearch-JobMetadataFooter > div');
        if (dateElement) {
          const dateText = await dateElement.textContent() || '';
          // Parse relative dates like "30+ days ago" or "Today" or "Just posted"
          if (dateText.includes('day')) {
            const days = parseInt(dateText.match(/(\d+)\+?\s+day/)?.[1] || '0');
            postedDate = new Date();
            postedDate.setDate(postedDate.getDate() - days);
          } else if (dateText.includes('Today') || dateText.includes('Just posted')) {
            postedDate = new Date();
          } else if (dateText.includes('month')) {
            const months = parseInt(dateText.match(/(\d+)\+?\s+month/)?.[1] || '0');
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
          source: 'Indeed',
        });
        
        // Close the details page
        await detailsPage.close();
        
        // Respect robots.txt with a delay between requests
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (error) {
        console.error('Error processing Indeed job listing:', error);
      }
    }
    
    console.log(`Indeed scraper completed. Found ${jobs.length} jobs.`);
    return jobs;
  } catch (error) {
    console.error('Error in Indeed scraper:', error);
    return jobs;
  } finally {
    await browser.close();
  }
}
