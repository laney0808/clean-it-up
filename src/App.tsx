import React from 'react';
import { Navigate, Route, Routes } from './router';
import ProjectsPage from './pages/ProjectsPage';
import ProjectViewerPage from './pages/ProjectViewerPage';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<ProjectsPage />} />
      <Route path="/project/:projectId" element={<ProjectViewerPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
