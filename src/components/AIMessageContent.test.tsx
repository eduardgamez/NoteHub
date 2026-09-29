import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { AIMessageContent } from './AIMessageContent';

describe('assistant message formatting', () => {
  it('renders inline list items and bold labels', () => {
    const { container } = render(<AIMessageContent content="Crearía pocos avisos: - **Viajes a Cambrils:** confirmar billete. - **Gastos del mes:** hacer el recuento." />);
    expect(container.querySelectorAll('li')).toHaveLength(2);
    expect(container.querySelectorAll('strong')).toHaveLength(2);
  });

  it('renders bracketed LaTeX as a displayed equation', () => {
    const { container } = render(<AIMessageContent content={'La entropía:\n\n[\nH(X)=-\\sum\\_{x\\in\\mathcal{X}}p(x)\\log\\_2 p(x)\n]'} />);
    expect(container.querySelector('.katex-display')).not.toBeNull();
    expect(container.querySelector('.katex-error')).toBeNull();
  });

  it('renders a previously stored malformed JSON envelope as an answer', () => {
    const raw = String.raw`{"text":"La entropía es\n\n[\nH(X)=-\sum\_{x\in\mathcal{X}}p(x),\n]","proposals":[]}`;
    const { container } = render(<AIMessageContent content={raw} />);
    expect(container.querySelector('.katex-display')).not.toBeNull();
    expect(container.textContent).not.toContain('"proposals"');
  });
});
