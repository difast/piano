// Сравнивает контент бэкенда с фронтендом (работает при полном чекауте репозитория).
import { LESSONS as FL } from '../../frontend/src/data/course.ts';
import { SONGS } from '../../frontend/src/data/songs.ts';
import { FREE_DAILY_LIMIT_SEC as FLIMIT } from '../../frontend/src/data/config.ts';
import { LEGAL_VERSION as FLEGAL } from '../../frontend/src/data/legal.ts';
import { FREE_DAILY_LIMIT_SEC, LEGAL_VERSION, LESSONS, SONG_IDS } from '../src/content.ts';

const a = JSON.stringify(FL.map((l) => ({ id: l.id, prerequisites: l.prerequisites })));
const b = JSON.stringify(LESSONS);
const problems: string[] = [];
if (a !== b) problems.push('уроки (id/prerequisites) отличаются');
if (JSON.stringify(SONGS.map((s) => s.id)) !== JSON.stringify(SONG_IDS)) problems.push('id песен отличаются');
if (FLIMIT !== FREE_DAILY_LIMIT_SEC) problems.push('лимит Free отличается');
if (FLEGAL !== LEGAL_VERSION) problems.push('версия юридических документов отличается');
if (problems.length) { console.error('РАССИНХРОН:\n- ' + problems.join('\n- ')); process.exit(1); }
console.log('OK: контент фронтенда и бэкенда совпадает');
