import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { seedWorkspace } from '../../data/seed';
import { useWorkspace } from '../../store/useWorkspace';
import { ProfileView } from './ProfileView';

describe('personal memory visibility', () => {
  beforeEach(() => useWorkspace.setState({ personalProfile: { ...structuredClone(seedWorkspace.personalProfile), answers: { style: 'Respuestas breves' }, notes: 'Vivo en Cambrils' } }));

  it('masks saved text by default and resets after leaving the view', () => {
    const first = render(<ProfileView />);
    expect(first.container.textContent).not.toContain('Vivo en Cambrils');
    expect(first.container.querySelector('.profile-free-space')?.textContent).toBe('••••••••••••••••');
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar memoria personal' }));
    expect(screen.getByRole('textbox', { name: 'Memoria libre' })).toHaveValue('Vivo en Cambrils');
    first.unmount();
    render(<ProfileView />);
    expect(screen.getByRole('button', { name: 'Mostrar memoria personal' })).toBeInTheDocument();
  });
});
