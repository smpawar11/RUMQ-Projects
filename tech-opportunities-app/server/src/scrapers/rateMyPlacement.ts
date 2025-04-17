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
 * Scrape internship listings from RateMyPlacement
 * @returns Array of scraped jobs
 */
export async function scrapeRateMyPlacement(): Promise<ScrapedJob[]> {
  console.log('Starting RateMyPlacement scraper...');
  const jobs: ScrapedJob[] = [];
  const browser = await chromium.launch({ headless: true });
  
  try {
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 800 }
    });
    const page = await context.newPage();
    
    // Navigate to the internships page
    await page.goto('https://www.ratemyplacement.co.uk/search?show=jobs&location=london&seo=internships&type=internship&industry=it-technology', {
      waitUntil: 'networkidle',
      timeout: 60000,
    });
    
    // Check for cookie consent popup and accept if present
    try {
      const cookieButton = await page.$('button:has-text("Accept"), button:has-text("I accept"), button:has-text("Allow all")');
      if (cookieButton) {
        await cookieButton.click();
        await page.waitForTimeout(1000); // Wait for popup to disappear
      }
    } catch (error) {
      console.log('No cookie banner found or error handling it');
    }
    
    // Wait for job listings to load - try multiple selectors
    try {
      await page.waitForSelector('.search-result, .job-card, [data-testid="job-listing"]', { timeout: 15000 });
    } catch (error) {
      console.log('Could not find standard job listing selectors. Looking for alternatives...');
      await page.screenshot({ path: 'ratemyplacement-debug.png' });
    }
    
    // Try different selectors for job listings
    let jobListings: ElementHandle<HTMLElement | SVGElement>[] = [];
    const selectors = [
      '.search-result', 
      '.job-card',
      '[data-testid="job-listing"]',
      'article.job',
      '.job-listing'
    ];
    
    for (const selector of selectors) {
      jobListings = await page.$$(selector);
      if (jobListings.length > 0) {
        console.log(`Found ${jobListings.length} jobs with selector: ${selector}`);
        break;
      }
    }
    
    if (jobListings.length === 0) {
      console.log('No job listings found on RateMyPlacement. Trying to find elements that look like job listings...');
      // Try to find elements that look like job listings
      jobListings = await page.$$('div:has-text("internship") >> xpath=./ancestor::div[contains(., "London")]');
      
      if (jobListings.length === 0) {
        console.log('Could not find any job listings on RateMyPlacement.');
        return jobs;
      }
    }
    
    for (const listing of jobListings) {
      try {
        // Try multiple selectors for job elements
        const titleSelectors = [
          '.search-result__title',
          'h2 a', 
          'h3 a',
          '[data-testid="job-title"]',
          'a:has-text("intern")',
          'a:has-text("Internship")'
        ];
        
        const companySelectors = [
          '.search-result__company-name',
          '[data-testid="company-name"]',
          '.company-name',
          'div:has-text("Company:") + div'
        ];
        
        const locationSelectors = [
          '.search-result__location',
          '[data-testid="location"]',
          '.location',
          'div:has-text("Location:") + div'
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
          'a.search-result__title',
          'h2 a', 
          'h3 a',
          '[data-testid="job-title"] a',
          'a[href*="job"]'
        ];
        
        for (const selector of linkSelectors) {
          const linkElement = await listing.$(selector);
          if (linkElement) {
            const href = await linkElement.getAttribute('href');
            if (href) {
              url = href.startsWith('http') ? href : `https://www.ratemyplacement.co.uk${href}`;
              break;
            }
          }
        }
        
        // If no URL found yet, look for any link in the job listing
        if (!url) {
          const anyLink = await listing.$('a');
          if (anyLink) {
            const href = await anyLink.getAttribute('href');
            if (href && href.includes('job')) {
              url = href.startsWith('http') ? href : `https://www.ratemyplacement.co.uk${href}`;
            }
          }
        }
        
        // Only proceed if we have the essential information
        if (!title.trim() || !company.trim() || !url.trim()) {
          console.log('Skipping RateMyPlacement listing due to missing info:', { title, company, url });
          continue;
        }
        
        console.log(`Processing RateMyPlacement job: ${title} at ${company}`);
        
        // Navigate to the job details page to get the description
        const detailsPage = await context.newPage();
        await detailsPage.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        
        // Extract description - try multiple selectors
        const descriptionSelectors = [
          '.job-description',
          '#job-description', 
          '[data-testid="job-description"]',
          'div[class*="description"]',
          'section:has-text("job description")' 
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
          '.job-info__date',
          '[data-testid="job-date"]',
          '.date-posted',
          'div:has-text("Posted:") + div'
        ];
        
        for (const selector of dateSelectors) {
          const element = await detailsPage.$(selector);
          if (element) {
            const dateText = await element.textContent() || '';
            // Try to parse date in various formats
            const dateMatch = dateText.match(/(\d{1,2})[a-z]{0,2}\s+([A-Za-z]+)\s+(\d{4})/);
            if (dateMatch) {
              const [_, day, month, year] = dateMatch;
              const monthMap: Record<string, number> = {
                'January': 0, 'February': 1, 'March': 2, 'April': 3, 'May': 4, 'June': 5,
                'July': 6, 'August': 7, 'September': 8, 'October': 9, 'November': 10, 'December': 11
              };
              if (monthMap[month] !== undefined) {
                postedDate = new Date(parseInt(year), monthMap[month], parseInt(day));
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
