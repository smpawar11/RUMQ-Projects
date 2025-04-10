# London Tech Internship Finder

A web application that aggregates tech and AI internships in London from various job sites.

## Features

- **Search Interface**: Search for internships by keywords and location
- **Job Listings**: View internships from multiple sources in one place
- **Save Jobs**: Bookmark interesting opportunities for later
- **Automatic Updates**: Daily scraping of job sites for fresh opportunities

## Tech Stack

### Frontend
- React
- TypeScript
- Tailwind CSS
- Axios

### Backend
- Node.js
- Express
- TypeScript
- MongoDB (with Mongoose)
- Redis (for caching)
- Playwright (for web scraping)
- Node-cron (for scheduling)

## Data Sources

The application scrapes internship listings from:
- Bright Network
- RateMyPlacement
- Gradcracker
- LinkedIn
- Indeed

## Getting Started

### Prerequisites

- Node.js (v16+)
- MongoDB
- Redis

### Installation

1. Clone the repository:
   ```
   git clone https://github.com/yourusername/tech-opportunities-app.git
   cd tech-opportunities-app
   ```

2. Install dependencies:
   ```
   npm run install:all
   ```

3. Set up environment variables:
   - Create a `.env` file in the server directory based on the provided `.env.example`

4. Start the development servers:
   ```
   npm run dev
   ```

### Running the Scrapers

To manually run the job scrapers:
```
npm run scrape
```

By default, scrapers run automatically every 24 hours when the server is running.

## API Endpoints

- `GET /api/jobs` - Get all jobs
- `GET /api/jobs/search?keyword=AI&location=London` - Search jobs
- `POST /api/jobs/save` - Save a job
- `GET /api/jobs/saved` - Get saved jobs
- `DELETE /api/jobs/saved/:jobId` - Remove a saved job

## Deployment

### Frontend
- Build: `cd client && npm run build`
- Deploy the `client/dist` directory to Vercel or similar static hosting

### Backend
- Build: `cd server && npm run build`
- Deploy the server to Render or similar Node.js hosting
- Set up MongoDB Atlas for the database
- Set up Redis Cloud for caching

## License

This project is licensed under the MIT License - see the LICENSE file for details.
