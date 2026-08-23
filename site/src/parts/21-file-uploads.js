/* Автоматично добавени връзки при разделянето на монолита. */
import { saveState } from './09-backend-integraciya.js';

/* =============================================================================
   FILE UPLOADS (mock — metadata only)
   ============================================================================= */
function uploadFile(category, subjId, fileMeta) {
  if (!state.uploads[category]) state.uploads[category] = {};
  if (!state.uploads[category][subjId]) state.uploads[category][subjId] = [];
  state.uploads[category][subjId].push(Object.assign({ ts: Date.now() }, fileMeta));
  saveState();
}
function getFiles(category, subjId) {
  return (state.uploads[category] && state.uploads[category][subjId]) || [];
}
function deleteFile(category, subjId, idx) {
  const files = getFiles(category, subjId);
  files.splice(idx, 1);
  saveState();
}
function formatBytes(bytes) {
  if (!bytes) return '—';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024*1024) return Math.round(bytes/1024) + ' KB';
  return (bytes / 1024 / 1024).toFixed(1) + ' MB';
}
function fileExt(name) {
  const m = String(name).match(/\.([a-z0-9]+)$/i);
  return m ? m[1].toUpperCase() : 'FILE';
}

export { deleteFile, fileExt, formatBytes, getFiles, uploadFile };
