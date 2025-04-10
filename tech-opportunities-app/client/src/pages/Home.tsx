import React, { useState, useEffect } from 'react';
import axios from 'axios';
import SearchBar from '../components/SearchBar';
import JobCard from '../components/JobCard';

interface Job {
  _id: string;
  title: string;
  company: string;
  location: string;
  url: string;
  description: string;
  postedDate: string;
  source: string;
}

const Home: React.FC = () => {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useState({
    keyword: '',
    location: 'London'
  });

  const fetchJobs = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (searchParams.keyword) params.append('keyword', searchParams.keyword);
      if (searchParams.location) params.append('location', searchParams.location);
      
      const response = await axios.get<Job[]>(`/api/jobs/search?${params.toString()}`);
      setJobs(response.data);
    } catch (err) {
      console.error('Error fetching jobs:', err);
      setError('Failed to fetch jobs. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchJobs();
  }, []);

  const handleSearch = (params: { keyword: string; location: string }) => {
    setSearchParams(params);
    fetchJobs();
  };

  const saveJob = async (jobId: string) => {
    try {
      await axios.post('/api/jobs/save', { jobId });
      alert('Job saved successfully!');
    } catch (err) {
      console.error('Error saving job:', err);
      alert('Failed to save job. Please try again.');
    }
  };

  return (
    <div>
      <SearchBar onSearch={handleSearch} initialValues={searchParams} />
      
      <div className="mt-6">
        <h2 className="text-xl font-semibold mb-4">
          {searchParams.keyword 
            ? `${jobs.length} results for "${searchParams.keyword}" in ${searchParams.location}`
            : `All internships in ${searchParams.location}`}
        </h2>
        
        {loading && <p className="text-center py-4">Loading jobs...</p>}
        
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
            {error}
          </div>
        )}
        
        {!loading && !error && jobs.length === 0 && (
          <div className="text-center py-8">
            <p className="text-gray-600">No jobs found. Try adjusting your search criteria.</p>
          </div>
        )}
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {jobs.map(job => (
            <JobCard 
              key={job._id} 
              job={job} 
              onSave={() => saveJob(job._id)} 
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default Home;
