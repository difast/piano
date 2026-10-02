import { useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { usePracticeTimer } from '../hooks/usePracticeTimer';
import { usePageMeta } from '../hooks/usePageMeta';
import { track } from '../services/analytics';
import { Piano } from '../components/Piano';
import { LimitNotice } from '../components/LimitNotice';

export default function PianoPage() {
  usePageMeta('Пианино', 'Виртуальное пианино онлайн: играйте мышью, пальцем на телефоне или клавишами компьютера. Подсветка клавиш и названия нот.');
  const { limitReached } = useApp();
  usePracticeTimer(true);
  useEffect(() => { track('piano_open'); }, []);
  return (
    <>
      <h1>Пианино</h1>
      <p className="lead">Свободная практика. Играйте мышью, касанием или клавишами компьютера.</p>
      {limitReached && <LimitNotice />}
      <Piano octaves={3} disabled={limitReached} />
    </>
  );
}
