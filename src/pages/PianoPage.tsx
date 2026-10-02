import { useApp } from '../context/AppContext';
import { usePracticeTimer } from '../hooks/usePracticeTimer';
import { Piano } from '../components/Piano';
import { LimitNotice } from '../components/LimitNotice';

export default function PianoPage() {
  const { limitReached } = useApp();
  usePracticeTimer(true);
  return (
    <>
      <h1>Пианино</h1>
      <p className="lead">Свободная практика. Играйте мышью, касанием или клавишами компьютера.</p>
      {limitReached && <LimitNotice />}
      <Piano octaves={3} disabled={limitReached} />
    </>
  );
}
