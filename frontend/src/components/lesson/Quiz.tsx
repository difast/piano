import { useState } from 'react';
import type { Block } from '../../data/types';

type QuizBlock = Extract<Block, { type: 'quiz' }>;

export function Quiz({ block, onResult }: { block: QuizBlock; onResult: (firstTry: boolean) => void }) {
  const [picked, setPicked] = useState<number | null>(null);
  const [attempts, setAttempts] = useState(0);
  const correct = picked === block.answer;

  const pick = (i: number) => {
    if (correct) return;
    setPicked(i); setAttempts((a) => a + 1);
    if (i === block.answer) onResult(attempts === 0);
  };

  return (
    <section className="quiz">
      <span className="tag">Проверь себя</span>
      <h4>{block.question}</h4>
      <div className="options">
        {block.options.map((o, i) => (
          <button key={i} className={`opt${picked === i ? (i === block.answer ? ' right' : ' bad') : ''}`} onClick={() => pick(i)} disabled={correct && i !== block.answer}>{o}</button>
        ))}
      </div>
      {picked !== null && <p className={`quiz-note ${correct ? 'good' : 'warn'}`}>{correct ? '✓ Верно. ' : 'Пока не так — попробуй ещё раз. '}{correct && block.explain}</p>}
    </section>
  );
}
