import React, { useState, useEffect } from 'react';
import axios from 'axios';
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

const Saved: React.FC = () => {
  const [savedJobs, setSavedJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSavedJobs = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await axios.get<Job[]>('/api/jobs/saved');
      setSavedJobs(response.data);
    } catch (err) {
      console.error('Error fetching saved jobs:', err);
      setError('Failed to fetch saved jobs. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSavedJobs();
  }, []);

  const removeJob = async (jobId: string) => {
    try {
      await axios.delete(`/api/jobs/saved/${jobId}`);
      setSavedJobs(savedJobs.filter(job => job._id !== jobId));
      alert('Job removed from saved list!');
    } catch (err) {
      console.error('Error removing job:', err);
      alert('Failed to remove job. Please try again.');
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-semibold">Saved Internships</h2>
        <a href="/" className="text-blue-600 hover:text-blue-800">
          Back to Search
        </a>
      </div>
      
      {loading && <p className="text-center py-4">Loading saved jobs...</p>}
      
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}
      
      {!loading && !error && savedJobs.length === 0 && (
        <div className="text-center py-8">
          <p className="text-gray-600">No saved jobs found. Save some jobs to see them here!</p>
          <a 
            href="/" 
            className="mt-4 inline-block bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
          >
            Find Internships
          </a>
        </div>
      )}
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {savedJobs.map(job => (
          <JobCard 
            key={job._id} 
            job={job} 
            onSave={() => removeJob(job._id)}
            isSaved={true}
          />
        ))}
      </div>
    </div>
  );
};

export default Saved;
