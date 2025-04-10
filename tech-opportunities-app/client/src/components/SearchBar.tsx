import React, { useState } from 'react';

interface SearchBarProps {
  onSearch: (params: { keyword: string; location: string }) => void;
  initialValues: {
    keyword: string;
    location: string;
  };
}

const SearchBar: React.FC<SearchBarProps> = ({ onSearch, initialValues }) => {
  const [keyword, setKeyword] = useState(initialValues.keyword);
  const [location, setLocation] = useState(initialValues.location);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSearch({ keyword, location });
  };

  return (
    <div className="bg-white p-4 rounded-lg shadow-md">
      <form onSubmit={handleSubmit} className="flex flex-col md:flex-row gap-4">
        <div className="flex-1">
          <label htmlFor="keyword" className="block text-sm font-medium text-gray-700 mb-1">
            Keywords
          </label>
          <input
            type="text"
            id="keyword"
            placeholder="e.g. AI, Machine Learning, Data Science"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            className="w-full p-2 border border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        
        <div className="flex-1">
          <label htmlFor="location" className="block text-sm font-medium text-gray-700 mb-1">
            Location
          </label>
          <input
            type="text"
            id="location"
            placeholder="e.g. London"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="w-full p-2 border border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        
        <div className="flex items-end">
          <button
            type="submit"
            className="w-full md:w-auto bg-blue-600 text-white py-2 px-6 rounded hover:bg-blue-700 transition-colors"
          >
            Search
          </button>
        </div>
      </form>
    </div>
  );
};

export default SearchBar;
