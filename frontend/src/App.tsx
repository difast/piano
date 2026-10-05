import { useEffect } from 'react';
import { BrowserRouter, MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { PREVIEW } from './env';
import { AppProvider } from './context/AppContext';
import { UpsellProvider } from './context/UpsellContext';
import { ToastProvider } from './context/ToastContext';
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
import PaymentReturn from './pages/PaymentReturn';
import { ForgotPassword, ResetPassword, VerifyEmail } from './pages/PasswordPages';
import Scores from './pages/Scores';
import ScoreDetail from './pages/ScoreDetail';
import Auth from './pages/Auth';
import { Consent, Privacy, Terms } from './pages/Legal';
import Go from './pages/Go';

// Админ-кабинет — отдельная страница /admin/ (admin/index.html), не часть этого приложения.

function ScrollToTop() {
  const { pathname } = useLocation();
  // Эффект ничего не возвращает: иначе React вызовет результат scrollTo как функцию очистки
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

// Демо работает и в изолированных окнах (about:srcdoc), где History/URL API недоступны, поэтому MemoryRouter.
// Начальную страницу берём из #hash, чтобы ссылки на документы открывались в новой вкладке.
const initialPath = PREVIEW ? (window.location.hash.slice(1) || '/') : '/';
const Router = PREVIEW
  ? ({ children }: { children: React.ReactNode }) => <MemoryRouter initialEntries={[initialPath]}>{children}</MemoryRouter>
  : BrowserRouter;
const guard = (el: JSX.Element) => <RequireAuth>{el}</RequireAuth>;

export default function App() {
  return (
    <ToastProvider>
    <AppProvider>
      <Router>
        <Shell />
      </Router>
    </AppProvider>
    </ToastProvider>
  );
}

function Shell() {
  const { pathname } = useLocation();
  if (/^\/admin\/?$/.test(pathname)) return <AdminRedirect />;
  return (
        <UpsellProvider>
        <ScrollToTop />
        <Routes>
          <Route path="go/:slug" element={<Go />} />
          <Route element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="login" element={<Auth mode="login" />} />
            <Route path="register" element={<Auth mode="register" />} />
            <Route path="learn" element={guard(<Learn />)} />
            <Route path="learn/:id" element={guard(<Lesson />)} />
            <Route path="songs" element={<Songs />} />
            <Route path="songs/:id" element={guard(<SongDetail />)} />
            <Route path="scores" element={<Scores />} />
            <Route path="scores/:id" element={<ScoreDetail />} />
            <Route path="piano" element={guard(<PianoPage />)} />
            <Route path="progress" element={guard(<ProgressPage />)} />
            <Route path="profile" element={guard(<Profile />)} />
            <Route path="forgot-password" element={<ForgotPassword />} />
            <Route path="reset-password" element={<ResetPassword />} />
            <Route path="verify-email" element={<VerifyEmail />} />
            <Route path="payment/return" element={<PaymentReturn />} />
            <Route path="privacy" element={<Privacy />} />
            <Route path="terms" element={<Terms />} />
            <Route path="consent" element={<Consent />} />
            <Route path="*" element={<Home />} />
          </Route>
        </Routes>
        </UpsellProvider>
  );
}

/** Хостинг отдал приложение сайта вместо страницы админки: переходим на /admin/ (один раз, без зацикливания). */
function AdminRedirect() {
  const { pathname } = useLocation();
  useEffect(() => { if (pathname === '/admin') window.location.replace('/admin/'); }, [pathname]);
  return pathname === '/admin' ? null : (
    <div className="state" style={{ padding: 40 }}>Страница админ-кабинета не найдена на сервере. Проверьте, что фронтенд собран командой <code>npm run build</code> и выложена папка <code>dist</code> целиком (с <code>dist/admin/</code>).</div>
  );
}
