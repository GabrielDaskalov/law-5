/* Автоматично добавени връзки при разделянето на монолита. */
import { saveState } from './09-backend-integraciya.js';
import { Activity } from './14-data-service.js';

/* =============================================================================
   FEATURE — NOTES on conspect
   ============================================================================= */
function getNotes(subjId, topicIdx) {
  if (!state.notes[subjId]) return [];
  return state.notes[subjId][topicIdx] || [];
}
function addNote(subjId, topicIdx, noteData) {
  if (!state.notes[subjId]) state.notes[subjId] = {};
  if (!state.notes[subjId][topicIdx]) state.notes[subjId][topicIdx] = [];
  const note = Object.assign({
    id: 'n_' + Math.random().toString(36).slice(2, 10),
    createdAt: Date.now(),
    color: 'yellow',
  }, noteData);
  state.notes[subjId][topicIdx].push(note);
  saveState();
  if (typeof Activity !== 'undefined') Activity.log('note.add', subjId, { topicIdx });
  return note;
}
function deleteNote(subjId, topicIdx, noteId) {
  if (!state.notes[subjId] || !state.notes[subjId][topicIdx]) return;
  state.notes[subjId][topicIdx] = state.notes[subjId][topicIdx].filter(n => n.id !== noteId);
  saveState();
  if (typeof Activity !== 'undefined') Activity.log('note.delete', subjId, { topicIdx });
}
function updateNote(subjId, topicIdx, noteId, patch) {
  if (!state.notes[subjId] || !state.notes[subjId][topicIdx]) return;
  const n = state.notes[subjId][topicIdx].find(x => x.id === noteId);
  if (n) { Object.assign(n, patch); saveState(); }
}
function allNotesForSubject(subjId) {
  const sub = state.notes[subjId] || {};
  const out = [];
  Object.keys(sub).forEach(ti => sub[ti].forEach(n => out.push(Object.assign({ topicIdx: +ti }, n))));
  return out.sort((a, b) => b.createdAt - a.createdAt);
}

export { addNote, allNotesForSubject, deleteNote, getNotes, updateNote };
