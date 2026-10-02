import { useEffect } from 'react';
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import { Layout } from './components/Layout';
import { RequireAuth } from './components/RequireAuth';
import Home from './pages/Home';
import Learn from './pages/Learn';
import Lesson from './pages/Lesson';
import Songs from './pages/Songs';
import SongDetail from './pages/SongDetail';
import PianoPage from './pages/PianoPage';
import ProgressPage from './pages/ProgressPage';
import Profile from './pages/Profile';
import Auth from './pages/Auth';
import { Privacy, Terms } from './pages/Legal';

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => window.scrollTo(0, 0), [pathname]);
  return null;
}

const guard = (el: JSX.Element) => <RequireAuth>{el}</RequireAuth>;

export default function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <ScrollToTop />
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="login" element={<Auth mode="login" />} />
            <Route path="register" element={<Auth mode="register" />} />
            <Route path="learn" element={guard(<Learn />)} />
            <Route path="learn/:id" element={guard(<Lesson />)} />
            <Route path="songs" element={<Songs />} />
            <Route path="songs/:id" element={guard(<SongDetail />)} />
            <Route path="piano" element={guard(<PianoPage />)} />
            <Route path="progress" element={guard(<ProgressPage />)} />
            <Route path="profile" element={guard(<Profile />)} />
            <Route path="privacy" element={<Privacy />} />
            <Route path="terms" element={<Terms />} />
            <Route path="*" element={<Home />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AppProvider>
  );
}
