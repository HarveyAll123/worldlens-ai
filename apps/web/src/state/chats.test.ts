import { beforeEach, describe, expect, it } from 'vitest';
import { useChatsStore } from './chats';

const reset = () => {
  localStorage.clear();
  useChatsStore.setState({ chats: [], activeId: null });
};

describe('chats store', () => {
  beforeEach(reset);

  it('does not create a stored chat when starting a new one', () => {
    const s = useChatsStore.getState();
    s.startDraft();
    expect(useChatsStore.getState().chats).toHaveLength(0);
    expect(useChatsStore.getState().activeId).toBeNull();
    s.startDraft();
    s.startDraft();
    expect(useChatsStore.getState().chats).toHaveLength(0);
    // Chats live in memory: a guest's leave with them; an account's are on the server.
    useChatsStore.getState().appendTurn({ role: 'user', content: 'Quake near Taipei' }, 1000);
    expect(localStorage.getItem('worldlens.chats')).toBeNull();
  });

  it('creates the chat on the first message and reuses it afterwards', () => {
    const id = useChatsStore
      .getState()
      .appendTurn({ role: 'user', content: 'Quake near Taipei' }, 1000);
    const state = useChatsStore.getState();
    expect(state.chats).toHaveLength(1);
    expect(state.activeId).toBe(id);
    expect(state.chats[0]!.title).toBe('Quake near Taipei');
    useChatsStore
      .getState()
      .appendTurn({ role: 'assistant', content: 'Here is what I found.' }, 2000, id);
    expect(useChatsStore.getState().chats).toHaveLength(1);
    expect(useChatsStore.getState().chats[0]!.turns).toHaveLength(2);
  });

  it('removing the active chat falls back to the draft', () => {
    const id = useChatsStore.getState().appendTurn({ role: 'user', content: 'One' }, 1000);
    useChatsStore.getState().remove(id);
    expect(useChatsStore.getState().chats).toHaveLength(0);
    expect(useChatsStore.getState().activeId).toBeNull();
  });
});
