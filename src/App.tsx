import { useEffect } from 'react';
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import { Layout } from './components/Layout';
import Home from './pages/Home';
import Learn from './pages/Learn';
import Lesson from './pages/Lesson';
import Songs from './pages/Songs';
import SongDetail from './pages/SongDetail';
import PianoPage from './pages/PianoPage';
import ProgressPage from './pages/ProgressPage';
import Profile from './pages/Profile';

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => window.scrollTo(0, 0), [pathname]);
  return null;
}

export default function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <ScrollToTop />
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="learn" element={<Learn />} />
            <Route path="learn/:id" element={<Lesson />} />
            <Route path="songs" element={<Songs />} />
            <Route path="songs/:id" element={<SongDetail />} />
            <Route path="piano" element={<PianoPage />} />
            <Route path="progress" element={<ProgressPage />} />
            <Route path="profile" element={<Profile />} />
            <Route path="*" element={<Home />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AppProvider>
  );
}
