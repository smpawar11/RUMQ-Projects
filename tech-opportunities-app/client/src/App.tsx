import React from 'react';
import { Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import Saved from './pages/Saved';

const App: React.FC = () => {
  return (
    <div className="min-h-screen">
      <header className="bg-blue-600 text-white shadow-md">
        <div className="container py-4">
          <h1 className="text-2xl font-bold">London Tech Internship Finder</h1>
        </div>
      </header>
      <main className="container py-6">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/saved" element={<Saved />} />
        </Routes>
      </main>
      <footer className="bg-gray-100 py-4 mt-8">
        <div className="container text-center text-gray-600">
          <p>© {new Date().getFullYear()} London Tech Internship Finder</p>
        </div>
      </footer>
    </div>
  );
};

export default App;
