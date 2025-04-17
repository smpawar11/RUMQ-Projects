import { chromium, ElementHandle } from 'playwright';

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
  const browser = await chromium.launch({ 
    headless: true,
    args: ['--disable-features=site-per-process'] // This can help with some iframe issues
  });
  
  try {
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 800 }
    });
    const page = await context.newPage();
    
    // Navigate to the internships page
    await page.goto('https://www.linkedin.com/jobs/search/?keywords=internship%20technology&location=London%2C%20England%2C%20United%20Kingdom&f_TPR=&f_JT=I', {
      waitUntil: 'networkidle',
      timeout: 60000,
    });
    
    // Check for login wall and log it if present
    if (await page.content().then(html => html.includes('Join LinkedIn') || html.includes('Sign in'))) {
      console.log('LinkedIn is showing a login wall. Will try to scrape what we can.');
    }
    
    // Wait for job listings to load - try multiple selectors
    try {
      await page.waitForSelector('.jobs-search__results-list, .job-search-card, .jobs-search-results__list', { timeout: 15000 });
    } catch (error) {
      console.log('Could not find standard job listing selectors. Looking for alternatives...');
      await page.screenshot({ path: 'linkedin-debug.png' });
    }
    
    // Try multiple potential selectors for job listings
    let jobListings: ElementHandle<HTMLElement | SVGElement>[] = [];
    const selectors = [
      '.jobs-search__results-list > li', 
      '.job-search-card', 
      '.jobs-search-results__list-item',
      'div[data-job-id]'
    ];
    
    for (const selector of selectors) {
      jobListings = await page.$$(selector);
      if (jobListings.length > 0) {
        console.log(`Found ${jobListings.length} jobs with selector: ${selector}`);
        break;
      }
    }
    
    if (jobListings.length === 0) {
      console.log('No job listings found on LinkedIn. Trying to find elements that look like job cards...');
      // Try to find elements that look like job listings
      jobListings = await page.$$('div:has-text("London") >> xpath=./ancestor::div[contains(., "intern")]');
      
      if (jobListings.length === 0) {
        console.log('Could not find any job listings on LinkedIn.');
        return jobs;
      }
    }
    
    // Limit to 10-15 jobs to avoid rate limiting and improve reliability
    const jobsToProcess = jobListings.slice(0, 15);
    console.log(`Processing ${jobsToProcess.length} job listings from LinkedIn`);
    
    for (const listing of jobsToProcess) {
      try {
        // Try multiple selectors for job elements
        const titleSelectors = [
          '.base-search-card__title',
          '.job-search-card__title',
          'h3.base-search-card__title',
          'h3[class*="title"]',
          'a[data-control-name="job_title"]'
        ];
        
        const companySelectors = [
          '.base-search-card__subtitle',
          '.job-search-card__subtitle',
          '.job-search-card__company-name',
          'h4.base-search-card__subtitle',
          'a[data-control-name="company_link"]'
        ];
        
        const locationSelectors = [
          '.job-search-card__location',
          '.base-search-card__metadata',
          '.job-search-card__location span',
          'span[class*="location"]'
        ];
        
        // Get job title
        let title = '';
        let titleElement;
        for (const selector of titleSelectors) {
          titleElement = await listing.$(selector);
          if (titleElement) {
            title = await titleElement.textContent() || '';
            if (title) break;
          }
        }
        
        // Get company name
        let company = '';
        for (const selector of companySelectors) {
          const element = await listing.$(selector);
          if (element) {
            company = await element.textContent() || '';
            if (company) break;
          }
        }
        
        // Get location
        let location = 'London';
        for (const selector of locationSelectors) {
          const element = await listing.$(selector);
          if (element) {
            const loc = await element.textContent();
            if (loc) {
              location = loc;
              break;
            }
          }
        }
        
        // Get URL - multiple approaches
        let url = '';
        const linkSelectors = [
          'a.base-card__full-link',
          'a.job-search-card__link',
          '.base-card a',
          'a[data-control-name="job_title"]',
          'a[href*="/jobs/view/"]'
        ];
        
        for (const selector of linkSelectors) {
          const linkElement = await listing.$(selector);
          if (linkElement) {
            const href = await linkElement.getAttribute('href');
            if (href) {
              url = href;
              break;
            }
          }
        }
        
        // If no URL found yet, try to get job ID and construct URL
        if (!url) {
          const jobIdFromAttr = await listing.getAttribute('data-job-id');
          const entityUrn = await listing.getAttribute('data-entity-urn');
          let jobId = jobIdFromAttr;
          
          if (!jobId && entityUrn) {
            // Extract ID from the URN string
            const match = entityUrn.match(/[0-9]+/);
            if (match && match[0]) {
              jobId = match[0];
            }
          }
          
          if (jobId) {
            url = `https://www.linkedin.com/jobs/view/${jobId}/`;
          }
        }
        
        // Only proceed if we have the essential information
        if (!title.trim() || !company.trim() || !url.trim()) {
          console.log('Skipping LinkedIn listing due to missing info:', { title, company, url });
          continue;
        }
        
        console.log(`Processing LinkedIn job: ${title} at ${company}`);
        
        // Navigate to the job details page to get the description
        const detailsPage = await context.newPage();
        await detailsPage.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        
        // Extract description - try multiple selectors
        const descriptionSelectors = [
          '.description__text',
          '.show-more-less-html__markup',
          '[data-test-id="job-details"]',
          '.jobs-description__content',
          'section.description'
        ];
        
        let description = '';
        for (const selector of descriptionSelectors) {
          const element = await detailsPage.$(selector);
          if (element) {
            description = await element.textContent() || '';
            if (description) break;
          }
        }
        
        // Try to extract posted date
        let postedDate = new Date();
        const dateSelectors = [
          '.posted-time-ago__text',
          '.job-posted-date',
          '.job-details-jobs-unified-top-card__posted-date',
          'span.jobs-unified-top-card__posted-date'
        ];
        
        for (const selector of dateSelectors) {
          const element = await detailsPage.$(selector);
          if (element) {
            const dateText = await element.textContent() || '';
            if (dateText) {
              // Parse relative dates like "Posted 2 days ago" or "Posted 3 weeks ago"
              if (dateText.includes('day')) {
                const days = parseInt(dateText.match(/(\d+)\s+day/)?.[1] || '0');
                postedDate = new Date();
                postedDate.setDate(postedDate.getDate() - days);
                break;
              } else if (dateText.includes('week')) {
                const weeks = parseInt(dateText.match(/(\d+)\s+week/)?.[1] || '0');
                postedDate = new Date();
                postedDate.setDate(postedDate.getDate() - (weeks * 7));
                break;
              } else if (dateText.includes('month')) {
                const months = parseInt(dateText.match(/(\d+)\s+month/)?.[1] || '0');
                postedDate = new Date();
                postedDate.setMonth(postedDate.getMonth() - months);
                break;
              } else if (dateText.includes('hour') || dateText.includes('minute') || dateText.includes('just now')) {
                postedDate = new Date();
                break;
              }
            }
          }
        }
        
        // Add job to the list
        jobs.push({
          title: title.trim(),
          company: company.trim(),
          location: location.includes('London') ? 'London' : `${location.trim()}, London`,
          url,
          description: description.trim() || 'No description available',
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
