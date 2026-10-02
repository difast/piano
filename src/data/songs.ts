import type { Song } from './types';

export const SONGS: Song[] = [
  {
    id: 'ode-to-joy', title: 'Ода к радости', artist: 'Л. ван Бетховен', difficulty: 'beginner',
    cover: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
    description: 'Самая известная мелодия для первого разучивания: только пять нот правой рукой.',
    notes: ['E4','E4','F4','G4','G4','F4','E4','D4','C4','C4','D4','E4','E4','D4','D4'],
    steps: ['Положите правую руку на C-G.', 'Выучите первую строку: E E F G G F E D.', 'Добавьте вторую строку и играйте без пауз.'],
  },
  {
    id: 'twinkle', title: 'Twinkle, Twinkle, Little Star', artist: 'Народная', difficulty: 'beginner',
    cover: 'linear-gradient(135deg,#f59e0b,#ef4444)',
    description: 'Детская песня, с которой удобно начать — повторяющиеся фразы.',
    notes: ['C4','C4','G4','G4','A4','A4','G4','F4','F4','E4','E4','D4','D4','C4'],
    steps: ['Сыграйте C C G G A A G.', 'Затем F F E E D D C.', 'Соедините обе фразы.'],
  },
  {
    id: 'jingle', title: 'Jingle Bells', artist: 'Дж. Пирпонт', difficulty: 'beginner',
    cover: 'linear-gradient(135deg,#10b981,#0ea5e9)',
    description: 'Весёлая мелодия на трёх нотах в начале — легко запоминается.',
    notes: ['E4','E4','E4','E4','E4','E4','E4','G4','C4','D4','E4'],
    steps: ['Разучите E E E (пауза).', 'Повторите и добавьте G C D E.', 'Играйте в темпе припева.'],
  },
  {
    id: 'fur-elise', title: 'К Элизе', artist: 'Л. ван Бетховен', difficulty: 'intermediate',
    cover: 'linear-gradient(135deg,#ec4899,#8b5cf6)',
    description: 'Знаменитая багатель. Начало легко, но требует аккуратной беглости.',
    notes: ['E5','D#5','E5','D#5','E5','B4','D5','C5','A4'],
    steps: ['Выучите вступление правой рукой.', 'Добавьте левую: A2 E3 A3.', 'Работайте над ровностью и динамикой.'],
  },
  {
    id: 'moonlight', title: 'Лунная соната (1 часть)', artist: 'Л. ван Бетховен', difficulty: 'intermediate',
    cover: 'linear-gradient(135deg,#1e3a8a,#312e81)',
    description: 'Медленная, глубокая пьеса: ровные триоли и проникновенная мелодия.',
    notes: ['G#3','C#4','E4','G#3','C#4','E4'],
    steps: ['Играйте триоли очень ровно.', 'Добавьте басовую ноту левой рукой.', 'Используйте педаль на каждую гармонию.'],
  },
  {
    id: 'river-flows', title: 'River Flows in You', artist: 'Yiruma', difficulty: 'intermediate',
    cover: 'linear-gradient(135deg,#06b6d4,#3b82f6)',
    description: 'Современная классика, любимая в соцсетях. Плавная мелодия и арпеджио.',
    notes: ['A4','G#4','A4','G#4','A4','E4','A4','B4','C#5'],
    steps: ['Разберите тему правой рукой.', 'Выучите арпеджио левой рукой.', 'Соедините руки в медленном темпе.'],
  },
  {
    id: 'clair-de-lune', title: 'Лунный свет', artist: 'К. Дебюсси', difficulty: 'advanced',
    cover: 'linear-gradient(135deg,#475569,#0f172a)',
    description: 'Поэтичная пьеса Дебюсси. Требует хорошего контроля звука и педали.',
    notes: ['C#4','F4','G#4','C#5'],
    steps: ['Разберите по фразам.', 'Работайте над тембровыми оттенками.', 'Добавьте педаль с «полуотпусканием».'],
  },
  {
    id: 'liebestraum', title: 'Любовный сон №3', artist: 'Ф. Лист', difficulty: 'advanced',
    cover: 'linear-gradient(135deg,#be123c,#7c2d12)',
    description: 'Романтический шедевр с широкими аккордами и певучей мелодией.',
    notes: ['G#4','D#5','C5','G#4'],
    steps: ['Выучите мелодию правой рукой.', 'Разберите левую: широкие арпеджио.', 'Соедините с педалью.'],
  },
];
