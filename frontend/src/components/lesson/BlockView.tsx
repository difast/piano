import type { Block } from '../../data/types';
import { DemoKeys } from './DemoKeys';
import { PlayExercise, type ExerciseResult } from './PlayExercise';
import { Quiz } from './Quiz';
import { Metronome, RhythmBlockView } from './Rhythm';
import { HandDiagram } from './HandDiagram';
import { Checklist } from './Checklist';
import { StaffView } from './Staff';

export interface BlockResult { kind: 'play' | 'quiz' | 'check'; ok: boolean; detail?: string }

/** Отображает один блок урока. Результаты упражнений и тестов передаются наверх для итогов. */
export function BlockView({ block, onResult, onHardDone }: { block: Block; onResult: (r: BlockResult) => void; onHardDone: () => void }) {
  switch (block.type) {
    case 'text':
      return (
        <section className={`lesson-text${block.tone ? ` tone-${block.tone}` : ''}`}>
          {block.tone && <span className="tag">{block.tone === 'tip' ? 'Совет' : 'Важно'}</span>}
          {block.title && <h3>{block.title}</h3>}
          {block.paragraphs.map((p, i) => <p key={i}>{p}</p>)}
          {block.bullets && <ul>{block.bullets.map((b, i) => <li key={i}>{b}</li>)}</ul>}
        </section>
      );
    case 'demo': return <DemoKeys block={block} />;
    case 'play':
      return <PlayExercise block={block} onHardDone={onHardDone}
        onResult={(r: ExerciseResult) => onResult({ kind: 'play', ok: true, detail: r.errors ? `ошибок: ${r.errors}` : 'без ошибок' })} />;
    case 'quiz': return <Quiz block={block} onResult={(first) => onResult({ kind: 'quiz', ok: first })} />;
    case 'rhythm': return <RhythmBlockView block={block} />;
    case 'hand': return <HandDiagram block={block} />;
    case 'checklist': return <Checklist block={block} onResult={(all) => onResult({ kind: 'check', ok: all })} />;
    case 'metronome': return <Metronome block={block} />;
    case 'staff': return <StaffView block={block} />;
  }
}
