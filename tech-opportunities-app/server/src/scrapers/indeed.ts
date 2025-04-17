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
 * Scrape internship listings from Indeed
 * @returns Array of scraped jobs
 */
export async function scrapeIndeed(): Promise<ScrapedJob[]> {
  console.log('Starting Indeed scraper...');
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
    await page.goto('https://uk.indeed.com/jobs?q=technology+internship&l=London%2C+Greater+London&sc=0kf%3Ajt%28internship%29%3B', {
      waitUntil: 'networkidle', // Wait until network is idle
      timeout: 60000,
    });
    
    // Sometimes Indeed shows a captcha - let's log if that happens
    if (await page.content().then(html => html.includes('captcha'))) {
      console.log('Indeed is showing a captcha. Scraper may not work.');
      await page.screenshot({ path: 'indeed-captcha.png' });
    }
    
    // Wait for job listings to load - try multiple selectors
    try {
      await page.waitForSelector('.jobsearch-ResultsList, .job_seen_beacon, .tapItem', { timeout: 15000 });
    } catch (error) {
      console.log('Standard job listing selectors not found. Looking for alternatives...');
    }
    
    // Try different selectors for job listings
    let jobListings: ElementHandle<HTMLElement | SVGElement>[] = [];
    const selectors = ['.job_seen_beacon', '.tapItem', '[data-testid="jobListing"]', 'div[class*="job_"]'];
    
    for (const selector of selectors) {
      jobListings = await page.$$(selector);
      if (jobListings.length > 0) {
        console.log(`Found ${jobListings.length} jobs with selector: ${selector}`);
        break;
      }
    }
    
    if (jobListings.length === 0) {
      console.log('No job listings found on Indeed.');
      return jobs;
    }
    
    for (const listing of jobListings.slice(0, 15)) { // Limit to 15 jobs to avoid rate limiting
      try {
        // Try multiple selectors for job elements
        const titleSelectors = ['.jobTitle a', 'h2.jobTitle a', 'h2 a', '[data-testid="jobTitle"] a', 'a[id^="jobTitle"]'];
        const companySelectors = ['.companyName', '[data-testid="company-name"]', 'span[class*="companyName"]'];
        const locationSelectors = ['.companyLocation', '[data-testid="text-location"]', 'div[class*="location"]'];
        
        // Get job title
        let title = '';
        let titleElement: ElementHandle<HTMLElement | SVGElement> | null = null;
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
        
        // Try to get URL from title element
        if (titleElement) {
          url = await titleElement.getAttribute('href') || '';
          
          // Indeed sometimes uses relative URLs
          if (url && !url.startsWith('http')) {
            url = `https://uk.indeed.com${url}`;
          }
        }
        
        // If still no URL, try to find a direct link to the job
        if (!url) {
          const linkElement = await listing.$('a[id^="job_"]');
          if (linkElement) {
            url = await linkElement.getAttribute('href') || '';
            if (url && !url.startsWith('http')) {
              url = `https://uk.indeed.com${url}`;
            }
          }
        }
        
        // If still no URL, try to find the jobID and construct URL
        if (!url) {
          // Try to get job ID from listing element
          const jobId = await listing.getAttribute('data-jk') || 
                        (await listing.getAttribute('id'))?.replace('job_', '') || 
                        await listing.getAttribute('data-id');
          
          if (jobId) {
            url = `https://uk.indeed.com/viewjob?jk=${jobId}`;
          }
        }
        
        // Only proceed if we have the essential information
        if (!title.trim() || !company.trim() || !url.trim()) {
          console.log('Skipping Indeed listing due to missing info:', { title, company, url });
          continue;
        }
        
        console.log(`Processing Indeed job: ${title} at ${company}`);
        
        // Navigate to the job details page to get the description
        const detailsPage = await context.newPage();
        await detailsPage.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        
        // Extract description - try multiple selectors
        const descriptionSelectors = [
          '#jobDescriptionText', 
          '[data-testid="jobDescriptionText"]',
          '.jobsearch-JobComponent-description',
          'div[id*="jobDescription"]'
        ];
        
        let description = '';
        for (const selector of descriptionSelectors) {
          const element = await detailsPage.$(selector);
          if (element) {
            description = await element.textContent() || '';
            if (description) break;
          }
        }
        
        // Try to extract posted date, default to current date if not found
        let postedDate = new Date();
        const dateSelectors = [
          '.jobsearch-JobMetadataFooter > div',
          '[data-testid="job-age"]', 
          'span[class*="date"]'
        ];
        
        for (const selector of dateSelectors) {
          const element = await detailsPage.$(selector);
          if (element) {
            const dateText = await element.textContent() || '';
            if (dateText) {
              // Parse relative dates like "30+ days ago" or "Today" or "Just posted"
              if (dateText.includes('day')) {
                const days = parseInt(dateText.match(/(\d+)\+?\s+day/)?.[1] || '0');
                postedDate = new Date();
                postedDate.setDate(postedDate.getDate() - days);
                break;
              } else if (dateText.includes('Today') || dateText.includes('Just posted')) {
                postedDate = new Date();
                break;
              } else if (dateText.includes('month')) {
                const months = parseInt(dateText.match(/(\d+)\+?\s+month/)?.[1] || '0');
                postedDate = new Date();
                postedDate.setMonth(postedDate.getMonth() - months);
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
