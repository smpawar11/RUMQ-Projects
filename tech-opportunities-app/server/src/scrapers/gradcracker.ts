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
 * Scrape internship listings from Gradcracker
 * @returns Array of scraped jobs
 */
export async function scrapeGradcracker(): Promise<ScrapedJob[]> {
  console.log('Starting Gradcracker scraper...');
  const jobs: ScrapedJob[] = [];
  const browser = await chromium.launch({ headless: true });
  
  try {
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 800 }
    });
    const page = await context.newPage();
    
    // Navigate to the internships page
    await page.goto('https://www.gradcracker.com/search/computing-technology-jobs/internships-placements/london', {
      waitUntil: 'networkidle',
      timeout: 60000,
    });
    
    // Wait for job listings to load - try multiple potential selectors
    try {
      await page.waitForSelector('.job-result, .vacancy-item, [data-testid="job-card"]', { timeout: 15000 });
    } catch (error) {
      console.log('Could not find standard job listing selectors. Looking for alternatives...');
      // Take screenshot for debugging
      await page.screenshot({ path: 'gradcracker-debug.png' });
    }
    
    // Try multiple potential selectors for job listings
    let jobListings: ElementHandle<HTMLElement | SVGElement>[] = [];
    const selectors = [
      '.job-result', 
      '.vacancy-item', 
      '[data-testid="job-card"]',
      '.job-card',
      'article.job'
    ];
    
    for (const selector of selectors) {
      jobListings = await page.$$(selector);
      if (jobListings.length > 0) {
        console.log(`Found ${jobListings.length} jobs with selector: ${selector}`);
        break;
      }
    }
    
    if (jobListings.length === 0) {
      console.log('No job listings found on Gradcracker. Trying to find elements that look like job cards...');
      // Try to find elements that look like job listings
      jobListings = await page.$$('div:has-text("London") >> xpath=./ancestor::div[contains(., "Apply") or contains(., "View")]');
      
      if (jobListings.length === 0) {
        console.log('Could not find any job listings on Gradcracker.');
        return jobs;
      }
    }
    
    for (const listing of jobListings) {
      try {
        // Try multiple selectors for job elements
        const titleSelectors = [
          '.job-result-title', 
          'h3', 
          'h2',
          '[data-testid="job-title"]',
          'a:has-text("Intern")',
          'a:has-text("Placement")'
        ];
        
        const companySelectors = [
          '.job-result-company-name',
          '[data-testid="company-name"]',
          '.company',
          'div:has-text("Company:") + div'
        ];
        
        const locationSelectors = [
          '.job-result-location',
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
          'a.job-result-title',
          'a[href*="job"]',
          '[data-testid="job-title"] a',
          'h3 a',
          'h2 a'
        ];
        
        for (const selector of linkSelectors) {
          const linkElement = await listing.$(selector);
          if (linkElement) {
            const href = await linkElement.getAttribute('href');
            if (href) {
              url = href.startsWith('http') ? href : `https://www.gradcracker.com${href}`;
              break;
            }
          }
        }
        
        // If no URL found yet, look for any link in the job listing
        if (!url) {
          const anyLink = await listing.$('a');
          if (anyLink) {
            const href = await anyLink.getAttribute('href');
            if (href && (href.includes('job') || href.includes('vacancy'))) {
              url = href.startsWith('http') ? href : `https://www.gradcracker.com${href}`;
            }
          }
        }
        
        // Only proceed if we have the essential information
        if (!title.trim() || !company.trim() || !url.trim()) {
          console.log('Skipping Gradcracker listing due to missing info:', { title, company, url });
          continue;
        }
        
        console.log(`Processing Gradcracker job: ${title} at ${company}`);
        
        // Navigate to the job details page to get the description
        let description = '';
        try {
          const detailsPage = await context.newPage();
          await detailsPage.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
          
          // Extract description - try multiple selectors
          const descriptionSelectors = [
            '.job-description',
            '#job-description', 
            '[data-testid="job-description"]',
            'div[class*="description"]',
            'section:has-text("Job Description")'
          ];
          
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
            '.job-posted-date',
            '[data-testid="job-date"]',
            'div:has-text("Posted:") + div',
            'span:has-text("Posted")'
          ];
          
          for (const selector of dateSelectors) {
            const element = await detailsPage.$(selector);
            if (element) {
              const dateText = await element.textContent() || '';
              // Format: "Posted: 15th April 2023" or similar patterns
              const dateMatch = dateText.match(/(\d{1,2})[a-z]{0,2}\s+([A-Za-z]+)\s+(\d{4})/);
              if (dateMatch) {
                const [_, day, month, year] = dateMatch;
                const monthMap: Record<string, number> = {
                  'January': 0, 'February': 1, 'March': 2, 'April': 3, 'May': 4, 'June': 5,
                  'July': 6, 'August': 7, 'September': 8, 'October': 9, 'November': 10, 'December': 11
                };
                if (monthMap[month]) {
                  postedDate = new Date(parseInt(year), monthMap[month], parseInt(day));
                }
                break;
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
            source: 'Gradcracker',
          });
          
          // Close the details page
          await detailsPage.close();
        } catch (error) {
          console.error('Error fetching Gradcracker job details:', error);
        }
        
        // Respect robots.txt with a delay between requests
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (error) {
        console.error('Error processing Gradcracker job listing:', error);
      }
    }
    
    console.log(`Gradcracker scraper completed. Found ${jobs.length} jobs.`);
    return jobs;
  } catch (error) {
    console.error('Error in Gradcracker scraper:', error);
    return jobs;
  } finally {
    await browser.close();
  }
}
