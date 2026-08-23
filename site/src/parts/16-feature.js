/* Автоматично добавени връзки при разделянето на монолита. */
import { saveState } from './09-backend-integraciya.js';
import { Activity } from './14-data-service.js';
import { updateTopicProgress } from './17-feature.js';

/* =============================================================================
   FEATURE — VIDEOS per topic
   Videos are stored in state.videos (admin-editable) and can be YouTube/Vimeo/MP4.
   ============================================================================= */
function getVideo(subjId, topicIdx) {
  if (!state.videos[subjId]) return null;
  return state.videos[subjId][topicIdx] || null;
}
function setVideo(subjId, topicIdx, videoData) {
  if (!state.videos[subjId]) state.videos[subjId] = {};
  state.videos[subjId][topicIdx] = Object.assign({}, state.videos[subjId][topicIdx] || {}, videoData);
  saveState();
}
function markVideoWatched(subjId, topicIdx) {
  const v = getVideo(subjId, topicIdx);
  if (!v) return;
  setVideo(subjId, topicIdx, { watched: true, watchedAt: Date.now() });
  updateTopicProgress(subjId, topicIdx, 'video', true);
  if (typeof Activity !== 'undefined') Activity.log('video.watched', subjId, { topicIdx });
}
// Само тези хостове се вграждат. Старият вариант връщаше непознатия адрес
// какъвто е — тоест „javascript:", „data:" или чужд сайт влизаха право в
// src атрибута. А проверката с /youtube\.com/ върху целия низ приемаше и
// „https://evil.com/#youtube.com“ за легитимно видео.
const VIDEO_HOSTOVE = ['www.youtube.com', 'youtube.com', 'youtu.be', 'vimeo.com', 'player.vimeo.com'];

function videoRazbor(url) {
  if (!url) return null;
  let u;
  try { u = new URL(String(url), location.origin); } catch (e) { return null; }
  if (u.protocol !== 'https:') return null;
  if (VIDEO_HOSTOVE.indexOf(u.hostname) === -1) {
    // допускаме и пряк MP4 файл, но само по https
    return /\.mp4($|\?)/i.test(u.pathname) ? { embed: false, src: u.href } : null;
  }
  let m = u.href.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{11})/);
  if (m) return { embed: true, src: 'https://www.youtube.com/embed/' + m[1] + '?rel=0' };
  m = u.href.match(/vimeo\.com\/(\d+)/);
  if (m) return { embed: true, src: 'https://player.vimeo.com/video/' + m[1] };
  return null;
}

function videoEmbedUrl(url) {
  const r = videoRazbor(url);
  return r ? r.src : '';
}
function videoIsEmbed(url) {
  const r = videoRazbor(url);
  return !!(r && r.embed);
}

export { getVideo, markVideoWatched, setVideo, videoEmbedUrl, videoIsEmbed };
