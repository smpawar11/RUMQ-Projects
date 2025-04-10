import { chromium, Page } from 'playwright';

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
 * Scrape internship listings from Bright Network
 * @returns Array of scraped jobs
 */
export async function scrapeBrightNetwork(): Promise<ScrapedJob[]> {
  console.log('Starting Bright Network scraper...');
  const jobs: ScrapedJob[] = [];
  const browser = await chromium.launch({ headless: true });
  
  try {
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    });
    const page = await context.newPage();
    
    // Navigate to the internships page
    await page.goto('https://www.brightnetwork.co.uk/search/?content_type=vacancy&vacancy_type=internship&location=london&industry=technology-it-software-development', {
      waitUntil: 'networkidle',
      timeout: 60000,
    });
    
    // Wait for job listings to load - try multiple selectors in case the site structure has changed
    try {
      await page.waitForSelector('.vacancy-item, .job-card, .internship-item, article.job-listing', { timeout: 15000 });
    } catch (error) {
      console.log('Could not find standard job listing selectors. Looking for any job-related elements...');
      
      // Capture a screenshot of the page for debugging
      await page.screenshot({ path: 'bright-network-debug.png' });
      
      // Try to identify the correct selector based on page content
      const pageContent = await page.content();
      
      if (pageContent.includes('No results found')) {
        console.log('No job listings found on Bright Network.');
        return jobs;
      }
    }
    
    // Try multiple potential selectors for job listings
    const potentialSelectors = [
      '.vacancy-item', 
      '.job-card', 
      '.internship-item', 
      'article.job-listing',
      '[data-testid="job-card"]'
    ];
    
    let jobListings: any[] = [];
    
    for (const selector of potentialSelectors) {
      const elements = await page.$$(selector);
      if (elements.length > 0) {
        console.log(`Found job listings with selector: ${selector}`);
        jobListings = elements;
        break;
      }
    }
    
    // If no known selectors work, try to find elements that look like job listings
    if (jobListings.length === 0) {
      console.log('Attempting to locate job listings using content hints...');
      const possibleJobListings = await page.$$('a:has-text("internship"), div:has-text("London") >> xpath=./ancestor::div[contains(., "Apply") or contains(., "View")]');
      if (possibleJobListings.length > 0) {
        jobListings = possibleJobListings;
      }
    }
    
    console.log(`Found ${jobListings.length} potential job listings`);
    
    for (const listing of jobListings) {
      try {
        // Extract job details - try multiple selector options
        const title = await extractTextContent(listing, [
          '.vacancy-item__title', 
          'h2', 
          '.job-title',
          'a:has-text("intern")'
        ]);
        
        const company = await extractTextContent(listing, [
          '.vacancy-item__company', 
          '.company-name',
          '.employer'
        ]);
        
        const location = await extractTextContent(listing, [
          '.vacancy-item__location', 
          '.location',
          '[data-testid="location"]'
        ]) || 'London';
        
        // Try to find a link element
        let url = '';
        const linkSelectors = [
          'a.vacancy-item__title', 
          'a.job-link', 
          'a:has-text("View")',
          'a:first-child'
        ];
        
        for (const selector of linkSelectors) {
          const linkElement = await listing.$(selector);
          if (linkElement) {
            const href = await linkElement.getAttribute('href');
            if (href) {
              url = href.startsWith('http') ? href : `https://www.brightnetwork.co.uk${href}`;
              break;
            }
          }
        }
        
        // Only proceed if we have the essential information
        if (!title || !company || !url) {
          console.log('Skipping listing due to missing essential information');
          continue;
        }
        
        // Navigate to the job details page to get the description
        let description = '';
        try {
          const detailsPage = await context.newPage();
          await detailsPage.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
          
          // Try multiple selectors for description
          description = await extractTextContent(detailsPage, [
            '.vacancy__description', 
            '.job-description',
            '[data-testid="description"]',
            'div[class*="description"]',
            'section:has-text("Description")'
          ]);
          
          await detailsPage.close();
        } catch (error) {
          console.error('Error fetching job details page:', error);
        }
        
        // Use current date as posted date (Bright Network doesn't always show dates)
        const postedDate = new Date();
        
        // Add job to the list
        jobs.push({
          title: title.trim(),
          company: company.trim(),
          location: location.includes('London') ? 'London' : `${location.trim()}, London`,
          url,
          description: description.trim() || 'No description available',
          postedDate,
          source: 'Bright Network',
        });
        
        // Respect robots.txt with a delay between requests
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (error) {
        console.error('Error processing Bright Network job listing:', error);
      }
    }
    
    console.log(`Bright Network scraper completed. Found ${jobs.length} jobs.`);
    return jobs;
  } catch (error) {
    console.error('Error in Bright Network scraper:', error);
    return jobs;
  } finally {
    await browser.close();
  }
}

/**
 * Helper function to extract text content using multiple selectors
 */
async function extractTextContent(element: Page | any, selectors: string[]): Promise<string> {
  for (const selector of selectors) {
    try {
      const found = element.$ ? await element.$(selector) : await element.$(selector);
      if (found) {
        const text = await found.textContent();
        if (text && text.trim()) {
          return text.trim();
        }
      }
    } catch (error) {
      // Continue trying other selectors
    }
  }
  return '';
}
