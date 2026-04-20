/* ===========================================================================
   Weybooru Viewer — SillyTavern Extension v0.3.1

   Modal image viewer for ST. Uses szurubooru JSON API (weybooru.com).

   Files:  manifest.json | index.js (this) | template.html | style.css
   Stores: persistent → ST's extensionSettings | session → local `state` obj
   Mount:  ST hamburger menu (#options), with floating-button fallback
   =========================================================================== */

import { event_types, eventSource, saveSettingsDebounced } from '../../../script.js';

// extensionSettings is ST's persistent settings store; saveSettingsDebounced
// schedules a write to disk
const { extensionSettings } = SillyTavern.getContext();
export const WBV_MODULE_NAME = 'weybooru-viewer';
const EXT_VERSION = '0.3.1';
const EXT_DIR = '/scripts/extensions/weybooru-viewer';

const PAGE_LIMIT = 50;
/** Tag review / voting service (see voting-api.md). */
const TAG_VOTE_API_ORIGIN = 'https://tags.weybooru.com';
const TAG_VOTE_TOKEN_STORAGE_KEY = `${WBV_MODULE_NAME}_tagVoteToken`;
/** Last manual tag-review panel action: `'open'` | `'close'` (see tagReviewGetPanelPref). */
const TAG_REVIEW_PANEL_PREF_STORAGE_KEY = `${WBV_MODULE_NAME}_tagReviewPanelPref`;

// ── DEFAULTS ──────────────────────────────────────────────────────────────────
// These get persisted to ST's extensionSettings (survives across page reloads)
const defaults = {
  apiRoot: 'https://weybooru.com/api',
  creds: { username: '', token: '', tokenUser: '' },
  favorites: [],          // post IDs the user has hearted
  favPostsData: [],       // full post objects so favorites work offline
  history: [],            // recent search queries (capped at 30)
  savedTags: [],          // user's pinned tag chips (capped at 50)
  prefs: {
    slideSecs: 6,
    autofit: true,
    images: true, gifs: true, videos: false,
    rS: true, rQ: true, rE: true,              // szurubooru: safe / sketchy / unsafe
    blacklist: '',
    sort: 'newest',
  },
};

// ── SESSION STATE ─────────────────────────────────────────────────────────────
// Lives only as long as the page is loaded. Keeping these here (instead of
// persisting them) means closing the modal feels like minimizing — reopening
// returns to the same image/scroll/play state.
const state = {
  built: false,           // has the modal HTML been injected yet?
  open: false,            // is the modal currently visible?
  query: '',
  sort: 'newest',
  allPosts: [],           // current search results
  currentIdx: 0,
  currentPage: 0,         // for infinite scroll pagination
  loading: false,
  loadingMore: false,
  isPlaying: false,       // slideshow play/pause
  timer: null,            // setInterval handle for slideshow
  showFavs: false,        // viewing favorites or normal results?
  didSearch: false,
  favorites: new Set(),   // mirrored from settings on load for fast lookup
  favPosts: [],
  savedTags: [],
  panelsHidden: false,    // Z key / ⛶ button toggles this
  mobileView: 'main',     // which slide-over pane is active on mobile
  favBusy: false,         // favorite API in flight
  likeBusy: false,        // score (like) API in flight
  authUsername: '',     // Szurubooru Token-auth user; mirrored from creds.tokenUser on load
  imageTagsOpen: false,   // image overlay: tags list folded / unfolded
  tagReviewFetchGen: 0,   // cancel in-flight tag-review fetches when post/overlay changes
  tagReview: {
    postId: null,
    suggestions: [],
    idx: 0,
    expanded: true,
    loading: false,
    busy: false,
    error: null,
    allDone: false,
    /** True after a successful fetch returned no suggestions (or fetch failed); avoids refetch spam on re-render. */
    knownEmpty: false,
    /** Deep copy of suggestions from last successful GET /suggestions (used to restore browse list after all resolve). */
    suggestionsSnapshot: null,
    /** When true, suggestions are a read-only replay (resolved on server); voting is disabled. */
    browseReviewOnly: false,
  },
};

const HOTKEYS = [
  ['← / A',       'Previous'],
  ['→ / D',       'Next'],
  ['W',           'Back 10'],
  ['S',           'Forward 10'],
  ['Space',       'Play / Pause'],
  ['F',           'Toggle Auto-Fit'],
  ['Z',           'Hide/Show Panels'],
  ['E',           'Open Source'],
  ['G',           'Fave / Unfave'],
  ['L',           'Like / Unlike (score)'],
  ['Esc',         'Close Viewer'],
];

let settings = undefined;
let szuruDidBumpLogin = false;
let wbvBlacklistSearchTimer = null;

// ── SETTINGS ──────────────────────────────────────────────────────────────────
function getSettings() {
  if (!extensionSettings[WBV_MODULE_NAME]) {
    extensionSettings[WBV_MODULE_NAME] = structuredClone(defaults);
  }
  const s = extensionSettings[WBV_MODULE_NAME];
  for (const k of Object.keys(defaults)) {
    if (s[k] === undefined) s[k] = structuredClone(defaults[k]);
  }
  if (!s.creds) s.creds = structuredClone(defaults.creds);
  if (s.creds.r34Uid !== undefined) delete s.creds.r34Uid;
  if (s.creds.r34Key !== undefined) delete s.creds.r34Key;
  if (s.creds.username === undefined) s.creds.username = '';
  if (s.creds.token === undefined) s.creds.token = '';
  if (s.creds.tokenUser === undefined) s.creds.tokenUser = '';
  if (s.creds.username) {
    s.creds.username = '';
    saveSettingsDebounced();
  }
  if (s.apiRoot === undefined || s.apiRoot === '') s.apiRoot = defaults.apiRoot;
  if (s.prefs?.rG !== undefined) {
    if (s.prefs.rG === false) s.prefs.rQ = false;
    delete s.prefs.rG;
  }
  for (const k of Object.keys(defaults.prefs)) {
    if (s.prefs[k] === undefined) s.prefs[k] = defaults.prefs[k];
  }
  for (const k of Object.keys(defaults.creds)) {
    if (s.creds[k] === undefined) s.creds[k] = defaults.creds[k];
  }
  settings = s;
  return s;
}

function persistFromUI() {
  const s = getSettings();
  s.favorites = [...state.favorites];
  s.favPostsData = state.favPosts;
  s.history = state.history;
  s.savedTags = state.savedTags;
  s.prefs = {
    slideSecs: +$('#wbv-slide-secs').val() || 6,
    autofit:   $('#wbv-autofit').prop('checked'),
    images:    $('#wbv-f-images').prop('checked'),
    gifs:      $('#wbv-f-gifs').prop('checked'),
    videos:    $('#wbv-f-videos').prop('checked'),
    rS: $('#wbv-r-s').prop('checked'),
    rQ: $('#wbv-r-q').prop('checked'),
    rE: $('#wbv-r-e').prop('checked'),
    blacklist: $('#wbv-blacklist').val(),
    sort:      $('#wbv-sort').val(),
  };
  saveSettingsDebounced();
}

function applySettingsToUI() {
  const s = getSettings();
  state.authUsername = (s.creds.tokenUser || '').trim();
  $('#wbv-wb-user').val('');
  $('#wbv-wb-token').val(s.creds.token || '');
  $('#wbv-slide-secs').val(s.prefs.slideSecs);
  $('#wbv-autofit').prop('checked', s.prefs.autofit);
  $('#wbv-f-images').prop('checked', s.prefs.images);
  $('#wbv-f-gifs').prop('checked', s.prefs.gifs);
  $('#wbv-f-videos').prop('checked', s.prefs.videos);
  $('#wbv-r-s').prop('checked', s.prefs.rS);
  $('#wbv-r-q').prop('checked', s.prefs.rQ);
  $('#wbv-r-e').prop('checked', s.prefs.rE);
  $('#wbv-blacklist').val(s.prefs.blacklist);
  $('#wbv-sort').val(s.prefs.sort);
  updateSaveTokenButtonEnabled();
  state.favorites = new Set(s.favorites || []);
  state.favPosts = s.favPostsData || [];
  state.history = s.history || [];
  state.savedTags = s.savedTags || [];
}

// ── FETCH HELPERS ─────────────────────────────────────────────────────────────
function fileType(url) {
  if (!url) return 'image';
  const ext = url.split('?')[0].split('.').pop().toLowerCase();
  if (['mp4','webm','gifv'].includes(ext)) return 'video';
  if (ext === 'gif') return 'gif';
  return 'image';
}
function isTypeAllowed(url) {
  const ft = fileType(url);
  if (ft === 'video') return $('#wbv-f-videos').prop('checked');
  if (ft === 'gif')   return $('#wbv-f-gifs').prop('checked');
  return $('#wbv-f-images').prop('checked');
}
function isPostTypeAllowed(p) {
  const mime = (p.mimeType || '').toLowerCase();
  const t = (p.postType || '').toLowerCase();
  if (mime.startsWith('video/') || t === 'video') return $('#wbv-f-videos').prop('checked');
  if (t === 'flash') return $('#wbv-f-images').prop('checked');
  if (mime === 'image/gif' || t === 'animation') return $('#wbv-f-gifs').prop('checked');
  return isTypeAllowed(p.file_url);
}
function isRatingAllowed(r) {
  if (!r) return true;
  const c = r[0].toLowerCase();
  const map = { s: '#wbv-r-s', q: '#wbv-r-q', e: '#wbv-r-e' };
  return map[c] ? $(map[c]).prop('checked') : true;
}
function reformatUrl(url) {
  if (!url) return url;
  if (url.startsWith('//')) return 'https:' + url;
  return url;
}

const SZURU_SORT = {
  score:    'sort:score',
  favcount: 'sort:fav-count',
  random:   'sort:random',
  newest:   'sort:creation-date',
};
function buildSzuruQuery(tags, sort) {
  const sortTok = SZURU_SORT[sort] || SZURU_SORT.newest;
  const t = (tags || '').trim();
  return [t, sortTok].filter(Boolean).join(' ').trim();
}

function getBlacklist() {
  return $('#wbv-blacklist').val().toLowerCase().split(/\s+/).filter(Boolean);
}
function isBlacklisted(tags) {
  const bl = getBlacklist();
  if (!bl.length) return false;
  const postTags = (tags || '').toLowerCase().split(' ');
  return bl.some(t => postTags.includes(t));
}

// ── SZURUBOORU / WEYBOORU API ───────────────────────────────────────────────
function apiRootTrimmed() {
  return (getSettings().apiRoot || defaults.apiRoot).trim().replace(/\/+$/, '');
}
function siteOrigin() {
  try {
    return new URL(apiRootTrimmed()).origin;
  } catch {
    return 'https://weybooru.com';
  }
}
function authUsernameForApi() {
  const u = (state.authUsername || '').trim();
  if (u) return u;
  return (getSettings().creds?.tokenUser || '').trim();
}
function hasAuth() {
  const c = getSettings().creds;
  return !!(authUsernameForApi() && c?.token);
}
function buildAuthHeaders() {
  const c = getSettings().creds;
  const u = authUsernameForApi();
  if (!u || !c?.token) return {};
  const raw = `${u}:${c.token}`;
  const b64 = btoa(unescape(encodeURIComponent(raw)));
  return { Authorization: `Token ${b64}` };
}
// ── TAG REVIEW API (tags.weybooru.com) ───────────────────────────────────────
function tagVoteGetStoredToken() {
  try {
    return (localStorage.getItem(TAG_VOTE_TOKEN_STORAGE_KEY) || '').trim();
  } catch {
    return '';
  }
}
function tagVoteSetStoredToken(token) {
  try {
    const t = (token || '').trim();
    if (t) localStorage.setItem(TAG_VOTE_TOKEN_STORAGE_KEY, t);
    else localStorage.removeItem(TAG_VOTE_TOKEN_STORAGE_KEY);
  } catch {
    /* ignore quota / private mode */
  }
}
/** @returns {'open' | 'close' | null} */
function tagReviewGetPanelPref() {
  try {
    const v = (localStorage.getItem(TAG_REVIEW_PANEL_PREF_STORAGE_KEY) || '').trim().toLowerCase();
    if (v === 'open' || v === 'close') return v;
  } catch {
    /* ignore */
  }
  return null;
}
/** @param {'open' | 'close'} pref */
function tagReviewSetPanelPref(pref) {
  try {
    if (pref === 'open' || pref === 'close') localStorage.setItem(TAG_REVIEW_PANEL_PREF_STORAGE_KEY, pref);
  } catch {
    /* ignore quota / private mode */
  }
}
/** Non-empty suggestions list: expanded unless user last closed the panel or every item already has myVote. */
function tagReviewShouldStartExpandedForList(list) {
  const allReviewed = list.every(s => {
    const mv = s?.myVote;
    return mv === 'for' || mv === 'against';
  });
  const prefClosed = tagReviewGetPanelPref() === 'close';
  return !(allReviewed || prefClosed);
}
/** First index without a myVote; if every item has one, last index (browse-only tail). */
function tagReviewIdxFirstUnreviewed(list) {
  if (!list?.length) return 0;
  for (let i = 0; i < list.length; i++) {
    const mv = list[i]?.myVote;
    if (mv !== 'for' && mv !== 'against') return i;
  }
  return Math.max(0, list.length - 1);
}
async function tagVoteApiFetch(path, { method = 'GET', headers = {}, body } = {}) {
  const pathNorm = path.startsWith('/') ? path : `/${path}`;
  const url = `${TAG_VOTE_API_ORIGIN}${pathNorm}`;
  const h = { Accept: 'application/json', ...headers };
  if (body !== undefined) h['Content-Type'] = 'application/json';
  const r = await fetch(url, {
    method,
    headers: h,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!r.ok) {
    const err = new Error(json?.error || `HTTP ${r.status}`);
    err.status = r.status;
    err.body = json;
    throw err;
  }
  return json;
}
async function tagVoteEnsureSession() {
  const connectOnce = async () => {
    const stored = tagVoteGetStoredToken();
    const headers = {};
    if (stored) headers.Authorization = `Bearer ${stored}`;
    const json = await tagVoteApiFetch('/connect', { method: 'POST', headers });
    const token = (json?.token || '').trim();
    if (!token) throw new Error('Tag server returned no session token');
    if (token !== stored) tagVoteSetStoredToken(token);
    return token;
  };
  try {
    return await connectOnce();
  } catch (e) {
    if (e.status === 403 && tagVoteGetStoredToken()) {
      tagVoteSetStoredToken('');
      return await connectOnce();
    }
    throw e;
  }
}
async function tagVoteFetchSuggestions(postId, token) {
  const q = new URLSearchParams({ postId: String(postId), token });
  return await tagVoteApiFetch(`/suggestions?${q.toString()}`, { method: 'GET' });
}
async function tagVoteSubmit(postId, token, tag, side) {
  return await tagVoteApiFetch('/vote', {
    method: 'POST',
    body: { token, postId, tag, side },
  });
}

const TAG_VOTE_TAG_CAROUSEL_MS = 280;

/** Monotonic token so in-flight tag-name carousel steps stop after cancel / new navigation. */
let tagVoteCarouselGen = 0;
/** Last settled tag line (after animations or instant updates) for direction detection. */
let tagVoteDisplayed = { postId: null, idx: null, tag: '' };

function bumpTagVoteCarouselGen() {
  tagVoteCarouselGen++;
  return tagVoteCarouselGen;
}

function stripTagVoteTagMotionClasses($tag) {
  $tag.off('transitionend.wbvTagVoteSlide');
  $tag.removeClass(
    'wbv-tagvote-tag--no-trans wbv-tagvote-tag--out-left wbv-tagvote-tag--out-right wbv-tagvote-tag--prep-right wbv-tagvote-tag--prep-left'
  );
}

function clearTagVoteTagCarouselState($tag) {
  bumpTagVoteCarouselGen();
  tagVoteDisplayed = { postId: null, idx: null, tag: '' };
  if ($tag?.length) {
    stripTagVoteTagMotionClasses($tag);
    $tag.text('');
  }
}

/**
 * Updates the suggested-tag headline with an optional carousel transition
 * (next: out left / in from right; prev: out right / in from left).
 */
function updateTagReviewTagDisplay($tag, newTag, idx, postId) {
  if (!$tag?.length) return;
  const el = $tag[0];
  const prev = tagVoteDisplayed;
  let dir = null;
  if (postId != null && prev.postId === postId && prev.tag) {
    if (idx > prev.idx) dir = 'next';
    else if (idx < prev.idx) dir = 'prev';
    else if (idx === prev.idx && newTag !== prev.tag) dir = 'next';
  }

  if (!newTag) {
    clearTagVoteTagCarouselState($tag);
    return;
  }

  if (!dir) {
    const logicalSame =
      postId === prev.postId && idx === prev.idx && newTag === prev.tag;
    if (!logicalSame) bumpTagVoteCarouselGen();
    stripTagVoteTagMotionClasses($tag);
    $tag.text(newTag);
    tagVoteDisplayed = { postId, idx, tag: newTag };
    return;
  }

  const myGen = bumpTagVoteCarouselGen();
  stripTagVoteTagMotionClasses($tag);
  $tag.text(prev.tag || newTag);

  const outCls = dir === 'next' ? 'wbv-tagvote-tag--out-left' : 'wbv-tagvote-tag--out-right';
  const prepCls = dir === 'next' ? 'wbv-tagvote-tag--prep-right' : 'wbv-tagvote-tag--prep-left';

  void el.offsetWidth;
  $tag.addClass(outCls);

  let outFailSafe = setTimeout(() => {
    outFailSafe = null;
    $tag.off('transitionend.wbvTagVoteSlide', onOutDone);
    if (myGen === tagVoteCarouselGen) runPrepAndSlideIn();
  }, TAG_VOTE_TAG_CAROUSEL_MS + 120);

  function onOutDone(e) {
    if (e.target !== el || myGen !== tagVoteCarouselGen) return;
    if (e.propertyName !== 'transform') return;
    if (outFailSafe) {
      clearTimeout(outFailSafe);
      outFailSafe = null;
    }
    $tag.off('transitionend.wbvTagVoteSlide', onOutDone);
    runPrepAndSlideIn();
  }

  function finishSlideIn() {
    if (myGen !== tagVoteCarouselGen) return;
    stripTagVoteTagMotionClasses($tag);
    tagVoteDisplayed = { postId, idx, tag: newTag };
  }

  function runPrepAndSlideIn() {
    if (myGen !== tagVoteCarouselGen) return;
    $tag.removeClass('wbv-tagvote-tag--out-left wbv-tagvote-tag--out-right');
    $tag.addClass(`wbv-tagvote-tag--no-trans ${prepCls}`).text(newTag);
    void el.offsetWidth;
    $tag.removeClass('wbv-tagvote-tag--no-trans');
    void el.offsetWidth;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (myGen !== tagVoteCarouselGen) return;
        $tag.removeClass(prepCls);
        let inFailSafe = setTimeout(() => {
          inFailSafe = null;
          $tag.off('transitionend.wbvTagVoteSlide', onInDone);
          finishSlideIn();
        }, TAG_VOTE_TAG_CAROUSEL_MS + 120);
        function onInDone(e) {
          if (e.target !== el || myGen !== tagVoteCarouselGen) return;
          if (e.propertyName !== 'transform') return;
          if (inFailSafe) {
            clearTimeout(inFailSafe);
            inFailSafe = null;
          }
          $tag.off('transitionend.wbvTagVoteSlide', onInDone);
          finishSlideIn();
        }
        $tag.on('transitionend.wbvTagVoteSlide', onInDone);
      });
    });
  }

  $tag.on('transitionend.wbvTagVoteSlide', onOutDone);
}

let tagReviewAutoMinTimer = null;
let tagReviewToastHideTimer = null;

function clearTagReviewCompletionTimers() {
  if (tagReviewAutoMinTimer) {
    clearTimeout(tagReviewAutoMinTimer);
    tagReviewAutoMinTimer = null;
  }
  if (tagReviewToastHideTimer) {
    clearTimeout(tagReviewToastHideTimer);
    tagReviewToastHideTimer = null;
  }
}

function hideTagReviewCompletionToast(immediate) {
  if (!state.built) return;
  const toast = $('#wbv-tagvote-toast');
  toast.removeClass('wbv-tagvote-toast--show');
  if (immediate) {
    toast.addClass('wbv-hidden');
    return;
  }
  setTimeout(() => toast.addClass('wbv-hidden'), 320);
}

/** After the last suggestion is reviewed: toast, then auto-minimize the panel. */
function scheduleTagReviewCompletionToast() {
  clearTagReviewCompletionTimers();
  if (!state.built || !state.open) return;
  const toast = $('#wbv-tagvote-toast');
  if (!toast.length) return;
  toast.removeClass('wbv-hidden');
  void toast[0].offsetWidth;
  toast.addClass('wbv-tagvote-toast--show');

  tagReviewAutoMinTimer = setTimeout(() => {
    tagReviewAutoMinTimer = null;
    if (!state.open) return;
    const tr = state.tagReview;
    tr.expanded = false;
    pulseTagVoteBarBtn();
    syncTagReviewDom();
  }, 1000);

  tagReviewToastHideTimer = setTimeout(() => {
    tagReviewToastHideTimer = null;
    hideTagReviewCompletionToast();
  }, 3200);
}

let tagVoteBarFlashTimer = null;
/** Brief highlight on the bottom tag button when the review panel is closed. */
function pulseTagVoteBarBtn() {
  if (!state.built) return;
  const btn = $('#wbv-tagvote-bar-btn');
  if (!btn.length || btn.hasClass('wbv-hidden')) return;
  btn.removeClass('wbv-tagvote-bar-flash');
  const el = btn[0];
  void el.offsetWidth;
  btn.addClass('wbv-tagvote-bar-flash');
  if (tagVoteBarFlashTimer) clearTimeout(tagVoteBarFlashTimer);
  tagVoteBarFlashTimer = setTimeout(() => {
    tagVoteBarFlashTimer = null;
    btn.removeClass('wbv-tagvote-bar-flash');
  }, 450);
}

function resetTagReviewUi() {
  state.tagReviewFetchGen++;
  if (tagVoteBarFlashTimer) {
    clearTimeout(tagVoteBarFlashTimer);
    tagVoteBarFlashTimer = null;
  }
  if (state.built) {
    $('#wbv-tagvote-bar-btn').removeClass('wbv-tagvote-bar-flash');
    $('#wbv-tagvote-root').removeClass('wbv-tagvote-root--enter');
    clearTagVoteTagCarouselState($('#wbv-tagvote-tag'));
  } else {
    bumpTagVoteCarouselGen();
    tagVoteDisplayed = { postId: null, idx: null, tag: '' };
  }
  const tr = state.tagReview;
  tr.postId = null;
  tr.suggestions = [];
  tr.idx = 0;
  tr.expanded = true;
  tr.loading = false;
  tr.busy = false;
  tr.error = null;
  tr.allDone = false;
  tr.knownEmpty = false;
  tr.suggestionsSnapshot = null;
  tr.browseReviewOnly = false;
  clearTagReviewCompletionTimers();
  hideTagReviewCompletionToast(true);
  syncTagReviewDom();
}
function syncTagReviewDom() {
  const tr = state.tagReview;
  const root = $('#wbv-tagvote-root');
  const barBtn = $('#wbv-tagvote-bar-btn');
  const loading = $('#wbv-tagvote-loading');
  const errEl = $('#wbv-tagvote-error');
  const active = $('#wbv-tagvote-active');
  const n = tr.suggestions.length;
  const showBar = n > 0;

  if (!state.built) return;

  if (!showBar && !tr.loading) {
    root.addClass('wbv-hidden');
    barBtn.addClass('wbv-hidden').removeClass('wbv-tagvote-bar-flash');
    $('#wbv-tagvote-progress').text('');
    clearTagVoteTagCarouselState($('#wbv-tagvote-tag'));
    return;
  }

  if (showBar && !tr.loading) {
    barBtn.removeClass('wbv-hidden');
  } else {
    barBtn.addClass('wbv-hidden').removeClass('wbv-tagvote-bar-flash');
  }

  // After the early return above, any remaining state still has suggestions or is
  // still loading. Hide the root only while loading — not when collapsed — so
  // .wbv-tagvote-panel opacity/transform transitions still run on minimize/expand.
  if (tr.loading) {
    root.addClass('wbv-hidden');
    root.removeClass('wbv-tagvote-root--enter');
  } else {
    root.removeClass('wbv-hidden');
  }

  if (!tr.expanded) root.addClass('wbv-tagvote-collapsed');
  else root.removeClass('wbv-tagvote-collapsed');

  loading.toggleClass('wbv-hidden', !tr.loading);
  const showVoteErr = !!tr.error && n > 0;
  errEl.toggleClass('wbv-hidden', !showVoteErr);
  if (showVoteErr) errEl.text(tr.error);
  active.toggleClass('wbv-hidden', tr.loading || n === 0);

  if (n === 0) {
    $('#wbv-tagvote-progress').text('');
    clearTagVoteTagCarouselState($('#wbv-tagvote-tag'));
    return;
  }

  const cur = tr.suggestions[tr.idx];
  updateTagReviewTagDisplay($('#wbv-tagvote-tag'), cur?.tag || '', tr.idx, tr.postId);
  $('#wbv-tagvote-progress').text(` (${tr.idx + 1}/${n})`);
  const vf = cur?.votesFor ?? 0;
  const va = cur?.votesAgainst ?? 0;
  $('#wbv-tagvote-counts').text(`Votes · for ${vf} · against ${va}`);

  $('#wbv-tagvote-prev').prop('disabled', tr.idx <= 0 || tr.busy);
  $('#wbv-tagvote-next').prop('disabled', tr.idx >= n - 1 || tr.busy);

  const mv = cur?.myVote;
  const forBtn = $('#wbv-tagvote-for');
  const againstBtn = $('#wbv-tagvote-against');
  const mid = $('#wbv-tagvote-mid');
  forBtn.toggleClass('wbv-tagvote-picked', mv === 'for');
  againstBtn.toggleClass('wbv-tagvote-picked', mv === 'against');
  const voteLocked = tr.busy || tr.browseReviewOnly;
  forBtn.prop('disabled', voteLocked);
  againstBtn.prop('disabled', voteLocked);
  if (mv === 'for' || mv === 'against') {
    mid.text('Your vote').attr('data-pick', mv).addClass('wbv-show');
  } else {
    mid.text('').removeAttr('data-pick').removeClass('wbv-show');
  }
}
function tagReviewNavigate(delta) {
  const tr = state.tagReview;
  const n = tr.suggestions.length;
  if (!n || tr.busy) return;
  tr.idx = Math.max(0, Math.min(tr.idx + delta, n - 1));
  syncTagReviewDom();
}
async function loadTagReviewForPost(post) {
  const tr = state.tagReview;
  const postId = post?.numericId;

  if (postId == null) {
    resetTagReviewUi();
    return;
  }

  const samePost = tr.postId === postId;
  if (samePost && !tr.loading) {
    if (tr.suggestions.length > 0 || tr.allDone || tr.knownEmpty) {
      syncTagReviewDom();
      return;
    }
  }

  const gen = ++state.tagReviewFetchGen;
  if (!samePost) {
    tr.allDone = false;
    tr.knownEmpty = false;
    tr.browseReviewOnly = false;
    clearTagReviewCompletionTimers();
    hideTagReviewCompletionToast(true);
  }
  tr.postId = postId;
  tr.suggestions = [];
  tr.suggestionsSnapshot = null;
  tr.idx = 0;
  tr.error = null;
  tr.loading = true;
  tr.expanded = tagReviewGetPanelPref() !== 'close';
  syncTagReviewDom();

  try {
    const token = await tagVoteEnsureSession();
    if (gen !== state.tagReviewFetchGen) return;
    const data = await tagVoteFetchSuggestions(postId, token);
    if (gen !== state.tagReviewFetchGen) return;
    const list = Array.isArray(data?.suggestions) ? data.suggestions : [];
    tr.suggestions = list;
    tr.suggestionsSnapshot = list.length ? JSON.parse(JSON.stringify(list)) : null;
    tr.browseReviewOnly = false;
    tr.idx = tagReviewIdxFirstUnreviewed(list);
    tr.loading = false;
    tr.knownEmpty = list.length === 0;
    if (list.length === 0) {
      tr.expanded = false;
    } else {
      tr.expanded = tagReviewShouldStartExpandedForList(list);
    }
  } catch (e) {
    if (gen !== state.tagReviewFetchGen) return;
    tr.loading = false;
    tr.suggestions = [];
    tr.suggestionsSnapshot = null;
    tr.knownEmpty = true;
    tr.expanded = false;
    console.warn('[Weybooru Viewer] tag suggestions', e);
  }
  const root = $('#wbv-tagvote-root');
  if (state.built && root.length && !tr.loading && tr.suggestions.length > 0 && tr.expanded) {
    root[0].classList.add('wbv-tagvote-root--enter');
  }
  syncTagReviewDom();
  if (state.built && root.length && root[0].classList.contains('wbv-tagvote-root--enter')) {
    const enterGen = gen;
    void root[0].offsetWidth;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (enterGen !== state.tagReviewFetchGen) return;
        root[0]?.classList.remove('wbv-tagvote-root--enter');
      });
    });
  }
}
async function submitTagReviewVote(side) {
  const tr = state.tagReview;
  const list = tr.suggestions;
  const cur = list[tr.idx];
  if (!cur || tr.busy) return;
  const token = tagVoteGetStoredToken();
  if (!token) return;
  const postId = tr.postId;
  if (postId == null) return;

  const wasAllDone = tr.allDone;
  tr.busy = true;
  tr.error = null;
  syncTagReviewDom();
  try {
    const res = await tagVoteSubmit(postId, token, cur.tag, side);
    const resolved = !!res?.resolved;
    if (resolved) {
      list.splice(tr.idx, 1);
      if (!list.length) {
        tr.allDone = true;
        if (tr.suggestionsSnapshot?.length) {
          tr.suggestions = JSON.parse(JSON.stringify(tr.suggestionsSnapshot));
          tr.idx = tagReviewIdxFirstUnreviewed(tr.suggestions);
          tr.browseReviewOnly = true;
          clearTagVoteTagCarouselState($('#wbv-tagvote-tag'));
        } else {
          tr.browseReviewOnly = false;
        }
      } else {
        tr.browseReviewOnly = false;
        if (tr.idx >= list.length) tr.idx = list.length - 1;
      }
    } else {
      tr.browseReviewOnly = false;
      cur.votesFor = res?.votesFor ?? cur.votesFor;
      cur.votesAgainst = res?.votesAgainst ?? cur.votesAgainst;
      cur.myVote = side;
      tr.idx++;
      if (tr.idx >= list.length) {
        tr.allDone = true;
        tr.idx = Math.max(0, list.length - 1);
      }
    }
  } catch (e) {
    console.warn('[Weybooru Viewer] tag vote', e);
    tr.error = (e && e.message) ? e.message : String(e);
  } finally {
    tr.busy = false;
    syncTagReviewDom();
    if (tr.allDone && !wasAllDone) scheduleTagReviewCompletionToast();
  }
}

async function szuruFetch(url, options = {}) {
  const headers = {
    Accept: 'application/json',
    ...buildAuthHeaders(),
    ...options.headers,
  };
  if (options.body && (options.method === 'POST' || options.method === 'PUT' || options.method === 'PATCH')) {
    headers['Content-Type'] = 'application/json';
  }
  const r = await fetch(url, { ...options, headers });
  const text = await r.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (!r.ok) {
    const msg = body?.description || body?.title || `HTTP ${r.status}`;
    const err = new Error(msg);
    err.status = r.status;
    err.body = body;
    throw err;
  }
  return body;
}
function safetyToRating(safety) {
  const x = (safety || 'sketchy').toLowerCase();
  if (x === 'safe') return 's';
  if (x === 'unsafe') return 'e';
  return 'q';
}
function resolveMediaUrl(href, origin) {
  if (!href) return href;
  if (href.startsWith('//')) return 'https:' + href;
  if (/^https?:\/\//i.test(href)) return href;
  try {
    return new URL(href, origin + '/').href;
  } catch {
    return href;
  }
}
function flattenSzuruTags(tags) {
  if (!Array.isArray(tags)) return '';
  return tags.map(t => {
    if (typeof t === 'string') return t;
    const names = t?.names;
    if (Array.isArray(names) && names.length) return names.join(' ');
    return '';
  }).filter(Boolean).join(' ');
}
/** Szurubooru post `user` is a micro-user `{ name, avatarUrl }`. */
function szuruUploaderName(raw) {
  const u = raw?.user;
  if (u && typeof u === 'object' && u.name != null) return String(u.name).trim();
  if (typeof u === 'string') return u.trim();
  return '';
}
/** Build a search token for `uploader:` (quote when the name has spaces). */
function buildUploaderSearchQuery(name) {
  const n = String(name || '').trim();
  if (!n) return '';
  if (/\s/.test(n)) return `uploader:"${n.replace(/"/g, '')}"`;
  return `uploader:${n}`;
}
function normalizeSzuruPost(raw, origin) {
  const safety = (raw.safety || 'sketchy').toLowerCase();
  const rating = safetyToRating(safety);
  const file_url = resolveMediaUrl(raw.contentUrl, origin);
  const preview = resolveMediaUrl(raw.thumbnailUrl, origin) || file_url;
  const sample = file_url;
  return {
    numericId: raw.id,
    id: `wb_${raw.id}`,
    file_url: reformatUrl(file_url),
    preview: reformatUrl(preview),
    sample: reformatUrl(sample),
    tags: flattenSzuruTags(raw.tags),
    uploader: szuruUploaderName(raw),
    rating,
    score: raw.score ?? 0,
    ownScore: raw.ownScore != null ? raw.ownScore : 0,
    mimeType: raw.mimeType || '',
    postType: raw.type || '',
    site: 'weybooru',
    site_name: 'Weybooru',
    source_url: `${origin}/post/${raw.id}`,
  };
}
async function fetchWeybooru(tags, page, sort) {
  const root = apiRootTrimmed();
  const origin = siteOrigin();
  const q = buildSzuruQuery(tags, sort);
  const u = new URL(`${root}/posts/`);
  u.searchParams.set('limit', String(PAGE_LIMIT));
  u.searchParams.set('offset', String(page * PAGE_LIMIT));
  u.searchParams.set('query', q);
  if (hasAuth() && !szuruDidBumpLogin) u.searchParams.set('bump-login', '1');
  const data = await szuruFetch(u.href, { method: 'GET' });
  if (hasAuth() && u.searchParams.has('bump-login')) szuruDidBumpLogin = true;
  const list = Array.isArray(data?.results) ? data.results : [];
  return list
    .map(p => normalizeSzuruPost(p, origin))
    .filter(p => p.file_url && isPostTypeAllowed(p) && isRatingAllowed(p.rating))
    .filter(p => !isBlacklisted(p.tags));
}

async function fetchAll(tags, page, sort) {
  return await fetchWeybooru(tags, page, sort);
}

// ── ST CHARACTER CONTEXT ──────────────────────────────────────────────────────
// Reads the currently active character from ST so we can offer "search for
// this character" as a one-click button next to the search bar
function getActiveCharacterName() {
  try {
    const ctx = SillyTavern.getContext();
    const id = ctx.characterId;
    if (id === undefined || id === null) return null;
    const ch = ctx.characters?.[id];
    return ch?.name || null;
  } catch (e) {
    return null;
  }
}
// Booru tag convention: lowercase, spaces become underscores
function nameToTag(name) {
  if (!name) return '';
  return name.trim().toLowerCase().replace(/\s+/g, '_');
}

// ── BUILD / OPEN / CLOSE ──────────────────────────────────────────────────────
// First call to ensureBuilt() loads template.html via XHR and injects it into
// the page body. Subsequent opens just toggle visibility — the DOM persists,
// which is why session state (current image, search results) survives
// open/close without re-fetching.
async function ensureBuilt() {
  if (state.built) return;
  try {
    const html = await $.get(`${EXT_DIR}/template.html`);
    $('body').append(html);
  } catch (err) {
    console.error('[Weybooru Viewer] Failed to load template.html:', err);
    return;
  }
  applySettingsToUI();
  wireEvents();
  renderHotkeys();
  renderHistory();
  renderSavedTags();
  renderFavCount();
  renderViewFavsBtn();
  state.built = true;
}

async function openOverlay(initialQuery) {
  await ensureBuilt();
  $('#wbv-modal-overlay').css('display', 'flex');
  state.open = true;

  const qInit = typeof initialQuery === 'string' ? initialQuery.trim() : '';
  if (qInit) {
    $('#wbv-search').val(qInit);
    await doSearch(qInit);
  } else {
    const q = $('#wbv-search').val().trim();
    const name = getActiveCharacterName();
    if (!q && name) {
      const tag = nameToTag(name);
      if (tag) {
        $('#wbv-search').val(tag);
        await doSearch(tag);
      }
    }
  }
  updateCharHint();
  // focus search if no current view
  if (!state.didSearch) {
    setTimeout(() => $('#wbv-search').focus(), 50);
  }
}

function closeOverlay() {
  closeSearchHelp();
  if (wbvBlacklistSearchTimer) {
    clearTimeout(wbvBlacklistSearchTimer);
    wbvBlacklistSearchTimer = null;
  }
  $('#wbv-modal-overlay').css('display', 'none');
  state.open = false;
  resetTagReviewUi();
  if (state.isPlaying) {
    state.isPlaying = false;
    clearInterval(state.timer);
    renderPlayBtn();
  }
}

function toggleOverlay() {
  if (state.open) closeOverlay();
  else openOverlay();
}

// ── MOBILE VIEW SWITCHER (exposed globally for inline onclick) ────────────────
window.wbv_setMobileView = function (view) {
  const $container = $('#wbv-modal-overlay');
  $container.removeClass('show-menu show-info');
  $('#wbv-modal-overlay .mobile-nav-btn').removeClass('active');

  if (view === 'menu') {
    $container.addClass('show-menu');
    $('#wbv-modal-overlay .mobile-nav-btn').eq(0).addClass('active');
  } else if (view === 'info') {
    $container.addClass('show-info');
    $('#wbv-modal-overlay .mobile-nav-btn').eq(2).addClass('active');
  } else {
    $('#wbv-modal-overlay .mobile-nav-btn').eq(1).addClass('active');
  }
  state.mobileView = view;
};

// ── CHARACTER HINT ────────────────────────────────────────────────────────────
function openSearchHelp() {
  $('#wbv-search-help-pop').removeClass('wbv-hidden').attr('aria-hidden', 'false');
  setTimeout(() => $('#wbv-search-help-close').trigger('focus'), 0);
}
function closeSearchHelp() {
  $('#wbv-search-help-pop').addClass('wbv-hidden').attr('aria-hidden', 'true');
}

function updateCharHint() {
  const name = getActiveCharacterName();
  const hint = $('#wbv-char-hint');
  if (!name) { hint.removeClass('wbv-show'); return; }
  const tag = nameToTag(name);
  const currentSearch = $('#wbv-search').val().trim();
  if (currentSearch === tag) { hint.removeClass('wbv-show'); return; }
  hint.html(`<i class="fa-solid fa-rotate-right"></i> ${name}`);
  hint.addClass('wbv-show');
  hint.off('click').on('click', () => {
    $('#wbv-search').val(tag);
    doSearch();
  });
}

// ── SEARCH ────────────────────────────────────────────────────────────────────
function showState(s, msg) {
  $('#wbv-state-empty').toggleClass('wbv-hidden',   s !== 'empty');
  $('#wbv-state-loading').toggleClass('wbv-hidden', s !== 'loading');
  $('#wbv-state-error').toggleClass('wbv-hidden',   s !== 'error');
  $('#wbv-img-area').toggleClass('wbv-hidden',      s !== 'results');
  $('#wbv-ctrl-bar').toggleClass('wbv-show',        s === 'results');
  if (s !== 'results') {
    state.imageTagsOpen = false;
    $('#wbv-image-tags-float').removeClass('wbv-open');
    $('#wbv-image-tags-btn').attr('aria-expanded', 'false');
    $('#wbv-image-tags-panel').attr('aria-hidden', 'true');
    $('#wbv-image-uploader-btn').addClass('wbv-hidden').attr('aria-hidden', 'true').removeAttr('data-wbv-uploader').removeAttr('aria-label').removeAttr('title').text('');
    resetTagReviewUi();
  }
  if (s === 'error' && msg) $('#wbv-error-msg').text(msg);
}

async function doSearch(qOverride) {
  const query = qOverride !== undefined ? qOverride : $('#wbv-search').val().trim();
  const sort = $('#wbv-sort').val() || 'newest';
  state.query = query;
  state.sort = sort;
  $('#wbv-search').val(query);
  state.allPosts = [];
  state.currentIdx = 0;
  state.currentPage = 0;
  state.loading = true;
  state.showFavs = false;
  state.isPlaying = false;
  clearInterval(state.timer);
  state.didSearch = true;
  // on mobile, switch back to viewer pane after search
  if (window.innerWidth <= 900) window.wbv_setMobileView('main');
  showState('loading');
  if (query && !state.history.includes(query)) {
    state.history = [query, ...state.history].slice(0, 30);
    renderHistory();
  }
  persistFromUI();
  try {
    const posts = await fetchAll(query, 0, sort);
    state.allPosts = posts;
    if (!posts.length) {
      showState('error', 'No results found. Try different tags.');
    } else {
      showState('results');
      renderViewer();
      updateCharHint();
    }
  } catch (e) {
    console.error('[Weybooru Viewer]', e);
    showState('error', 'Fetch error: ' + e.message);
  } finally {
    state.loading = false;
  }
}

async function loadMore() {
  if (state.loadingMore || !state.didSearch || state.showFavs) return;
  state.loadingMore = true;
  $('#wbv-load-badge').addClass('wbv-show');
  try {
    const posts = await fetchAll(state.query, state.currentPage + 1, state.sort);
    if (posts.length) {
      state.currentPage++;
      state.allPosts = [...state.allPosts, ...posts];
      updateCounter();
    }
  } catch (e) {
    console.warn('[Weybooru Viewer] load more failed', e);
  } finally {
    state.loadingMore = false;
    $('#wbv-load-badge').removeClass('wbv-show');
  }
}

function getDisplayPosts() { return state.showFavs ? state.favPosts : state.allPosts; }
function go(idx) {
  const p = getDisplayPosts();
  state.currentIdx = Math.max(0, Math.min(idx, p.length - 1));
  renderViewer();
  if (!state.showFavs && state.currentIdx >= p.length - 8) loadMore();
}
function next() { go(state.currentIdx + 1); }
function prev() { go(state.currentIdx - 1); }
function jump(n) { go(state.currentIdx + n); }

function togglePlay() {
  state.isPlaying = !state.isPlaying;
  clearInterval(state.timer);
  if (state.isPlaying) {
    const secs = Math.max(1, +$('#wbv-slide-secs').val() || 6);
    state.timer = setInterval(() => {
      const p = getDisplayPosts();
      if (state.currentIdx >= p.length - 1) {
        state.isPlaying = false;
        clearInterval(state.timer);
        renderPlayBtn();
        return;
      }
      next();
    }, secs * 1000);
  }
  renderPlayBtn();
}

async function toggleFav() {
  const posts = getDisplayPosts();
  const post = posts[state.currentIdx];
  if (!post || state.favBusy) return;
  const removing = state.favorites.has(post.id);
  const root = apiRootTrimmed();
  if (hasAuth() && post.numericId != null) {
    state.favBusy = true;
    try {
      const url = `${root}/post/${post.numericId}/favorite`;
      if (removing) {
        try {
          await szuruFetch(url, { method: 'DELETE' });
        } catch (e) {
          if (e.status !== 404) throw e;
        }
      } else {
        await szuruFetch(url, { method: 'POST' });
      }
    } catch (e) {
      console.error('[Weybooru Viewer] favorite API', e);
      return;
    } finally {
      state.favBusy = false;
    }
  }
  if (removing) {
    state.favorites.delete(post.id);
    state.favPosts = state.favPosts.filter(p => p.id !== post.id);
  } else {
    state.favorites.add(post.id);
    state.favPosts.push(post);
  }
  persistFromUI();
  renderFavBtn();
  renderFavCount();
  renderViewFavsBtn();
}

/** Merge score + ownScore from a Szurubooru post response into cached lists. */
function mergeSzuruPostScoreFields(raw) {
  if (!raw || raw.id == null) return;
  const origin = siteOrigin();
  const norm = normalizeSzuruPost(raw, origin);
  const patch = { score: norm.score, ownScore: norm.ownScore };
  let favTouched = false;
  for (const p of state.allPosts) {
    if (p.id === norm.id || p.numericId === norm.numericId) Object.assign(p, patch);
  }
  for (const p of state.favPosts) {
    if (p.id === norm.id || p.numericId === norm.numericId) {
      Object.assign(p, patch);
      favTouched = true;
    }
  }
  if (favTouched) persistFromUI();
}

/** Szurubooru "like" is PUT /post/:id/score (+1 / 0), separate from favorites. */
async function toggleLike() {
  const posts = getDisplayPosts();
  const post = posts[state.currentIdx];
  if (!post || state.likeBusy) return;
  if (!hasAuth() || post.numericId == null) return;
  const root = apiRootTrimmed();
  const newScore = post.ownScore === 1 ? 0 : 1;
  state.likeBusy = true;
  try {
    const url = `${root}/post/${post.numericId}/score`;
    const body = await szuruFetch(url, {
      method: 'PUT',
      body: JSON.stringify({ score: newScore }),
    });
    mergeSzuruPostScoreFields(body);
  } catch (e) {
    console.error('[Weybooru Viewer] score (like) API', e);
  } finally {
    state.likeBusy = false;
  }
  renderLikeBtn();
}

function togglePanels() {
  state.panelsHidden = !state.panelsHidden;
  $('#wbv-modal-overlay').toggleClass('wbv-panels-hidden', state.panelsHidden);
}

function splitPostTags(tagsStr) {
  if (!tagsStr || typeof tagsStr !== 'string') return [];
  const seen = new Set();
  const out = [];
  for (const w of tagsStr.trim().split(/\s+/)) {
    if (!w || seen.has(w)) continue;
    seen.add(w);
    out.push(w);
  }
  return out;
}

function appendUniqueSpaceToken(fieldVal, token) {
  const raw = (fieldVal || '').trim();
  const parts = raw.split(/\s+/).filter(Boolean);
  const low = token.toLowerCase();
  if (parts.some(p => p.toLowerCase() === low)) return raw;
  return raw ? `${raw} ${token}` : token;
}

/** Appends `-tag` to the query if that exclusion token is not already present. */
function appendNegatedSearchToken(queryVal, tag) {
  const neg = /^-/.test(tag) ? tag : `-${tag}`;
  return appendUniqueSpaceToken(queryVal, neg);
}

function syncImageTagsPanelFromState() {
  const open = state.imageTagsOpen;
  $('#wbv-image-tags-float').toggleClass('wbv-open', open);
  $('#wbv-image-tags-btn').attr('aria-expanded', open ? 'true' : 'false');
  $('#wbv-image-tags-panel').attr('aria-hidden', open ? 'false' : 'true');
}

function renderImageTagsOverlay(post) {
  const list = $('#wbv-image-tags-list').empty();
  const names = splitPostTags(post?.tags);
  if (!names.length) {
    list.append($('<div>').addClass('wbv-image-tags-empty').text('No tags'));
  } else {
    const tip = 'Click: search this tag · Shift+click: add to search · Ctrl/Alt+click: add -tag to search';
    names.forEach(t => {
      list.append($('<div>').addClass('wbv-image-tags-item').attr('title', tip).text(t));
    });
  }
  syncImageTagsPanelFromState();
}

function renderUploaderOverlay(post) {
  const btn = $('#wbv-image-uploader-btn');
  const name = (post?.uploader || '').trim();
  if (!name) {
    btn.addClass('wbv-hidden').attr('aria-hidden', 'true').removeAttr('data-wbv-uploader').removeAttr('aria-label').removeAttr('title').text('');
    return;
  }
  const q = buildUploaderSearchQuery(name);
  btn.removeClass('wbv-hidden').attr('aria-hidden', 'false').attr('data-wbv-uploader', name);
  btn.attr('title', `Click to search: ${q}`);
  btn.attr('aria-label', `Search posts by uploader ${name}`);
  btn.text(`Artist: ${name}`);
}

// ── RENDER ────────────────────────────────────────────────────────────────────
function renderViewer() {
  const posts = getDisplayPosts();
  const post = posts[state.currentIdx];
  if (!post) return;
  const ft = fileType(post.file_url);
  const autofit = $('#wbv-autofit').prop('checked');
  const imgEl = document.getElementById('wbv-main-img');
  const vidEl = document.getElementById('wbv-main-vid');
  if (ft === 'video') {
    imgEl.classList.add('wbv-hidden');
    vidEl.classList.remove('wbv-hidden');
    vidEl.style.maxWidth = autofit ? '100%' : 'none';
    vidEl.style.maxHeight = autofit ? '100%' : 'none';
    if (vidEl.src !== post.file_url) { vidEl.src = post.file_url; vidEl.load(); }
  } else {
    vidEl.classList.add('wbv-hidden');
    vidEl.src = '';
    imgEl.classList.remove('wbv-hidden');
    imgEl.style.maxWidth = autofit ? '100%' : 'none';
    imgEl.style.maxHeight = autofit ? '100%' : 'none';
    if (imgEl.src !== post.file_url) {
      imgEl.crossOrigin = 'anonymous';
      imgEl.src = post.file_url;
      imgEl.onerror = () => {
        if (imgEl.crossOrigin) {
          imgEl.crossOrigin = null;
          imgEl.src = post.file_url;
          return;
        }
        if (post.sample && imgEl.src !== post.sample) imgEl.src = post.sample;
      };
    }
  }
  updateCounter();
  renderPlayBtn();
  renderFavBtn();
  renderLikeBtn();
  renderFilmstrip();
  renderSourceLink(post);
  renderUploaderOverlay(post);
  renderImageTagsOverlay(post);
  $('#wbv-exit-favs-btn').toggleClass('wbv-show', state.showFavs);
  void loadTagReviewForPost(post);
}

function updateCounter() {
  const p = getDisplayPosts();
  $('#wbv-counter').text(
    `${state.showFavs ? '♥ ' : ''}${state.currentIdx + 1} of ${p.length}${state.showFavs ? '' : '+'}`
  );
}
function renderPlayBtn() {
  const playing = state.isPlaying;
  $('#wbv-play-btn').html(
    playing
      ? '<i class="fa-solid fa-pause"></i> <span>pause</span>'
      : '<i class="fa-solid fa-play"></i> <span>play</span>'
  );
}
function renderFavBtn() {
  const posts = getDisplayPosts();
  const post = posts[state.currentIdx];
  const btn = $('#wbv-fav-btn');
  const isFav = post && state.favorites.has(post.id);
  btn.html(isFav ? '<i class="fa-solid fa-heart"></i>' : '<i class="fa-regular fa-heart"></i>');
  btn.css({
    color: isFav ? 'var(--wbv-fav)' : 'var(--rb-text-muted)',
    borderColor: isFav ? 'rgba(224,90,122,.5)' : 'var(--rb-border)',
  });
}
function renderLikeBtn() {
  const posts = getDisplayPosts();
  const post = posts[state.currentIdx];
  const btn = $('#wbv-like-btn');
  if (!post) return;
  const authed = hasAuth() && post.numericId != null;
  const liked = post.ownScore === 1;
  btn.prop('disabled', !authed);
  btn.attr('title', authed ? (liked ? 'Unlike (L)' : 'Like (L)') : 'Token required for likes');
  btn.html(liked ? '<i class="fa-solid fa-thumbs-up"></i>' : '<i class="fa-regular fa-thumbs-up"></i>');
  btn.css({
    color: liked ? 'var(--wbv-like)' : 'var(--rb-text-muted)',
    borderColor: liked ? 'rgba(231, 184, 77, 0.5)' : 'var(--rb-border)',
  });
}
function renderFavCount() { $('#wbv-fav-count').text(state.favorites.size); }
function renderViewFavsBtn() { $('#wbv-view-favs-btn').toggleClass('wbv-show', state.favorites.size > 0); }

function renderFilmstrip() {
  const posts = getDisplayPosts();
  const row = $('#wbv-film-row').empty();
  const start = Math.max(0, state.currentIdx - 2);
  posts.slice(start, start + 5).forEach((p, i) => {
    const img = $('<img>').addClass('wbv-film-thumb');
    if (start + i === state.currentIdx) img.addClass('wbv-active');
    img.attr('src', p.preview || p.sample || '');
    img.on('error', function() { $(this).css('opacity', '.25'); });
    img.on('click', () => go(start + i));
    row.append(img);
  });
}
function renderSourceLink(post) {
  $('#wbv-source-link')
    .attr('href', post.source_url)
    .html('<i class="fa-solid fa-up-right-from-square"></i> source');
}

function renderHistory() {
  const list = $('#wbv-history-list').empty();
  $('#wbv-clear-hist-btn').toggleClass('wbv-hidden', state.history.length === 0);
  if (!state.history.length) {
    list.html('<div style="font-size:11px;color:var(--rb-text-muted)">no history yet</div>');
    return;
  }
  state.history.forEach(h => {
    const div = $('<div>').addClass('wbv-hist-item').text(h || '(all posts)');
    div.on('click', () => { $('#wbv-search').val(h); doSearch(h); });
    list.append(div);
  });
}

function renderSavedTags() {
  const list = $('#wbv-saved-tags-list').empty();
  if (!state.savedTags.length) {
    list.html('<div style="font-size:11px;color:var(--rb-text-muted)">no saved searches yet<br><span style="font-size:10px;opacity:.7">enter text in search → hit <code>&nbsp;save&nbsp;</code></span></div>');
    return;
  }
  state.savedTags.forEach((tag, idx) => {
    const chip = $('<div>').addClass('wbv-tag-chip');
    const label = $('<span>').addClass('wbv-tag-label').text(tag);
    const x = $('<button>').addClass('wbv-tag-remove').attr('title', 'Remove').text('×');
    label.on('click', () => { $('#wbv-search').val(tag); doSearch(tag); });
    x.on('click', e => {
      e.stopPropagation();
      state.savedTags.splice(idx, 1);
      persistFromUI();
      renderSavedTags();
    });
    chip.append(label, x);
    list.append(chip);
  });
}
function addSavedTag() {
  const tag = $('#wbv-search').val().trim();
  if (!tag) {
    $('#wbv-search').css('borderColor', 'var(--rb-danger)');
    setTimeout(() => $('#wbv-search').css('borderColor', ''), 600);
    return;
  }
  if (state.savedTags.includes(tag)) return;
  state.savedTags.unshift(tag);
  if (state.savedTags.length > 50) state.savedTags = state.savedTags.slice(0, 50);
  persistFromUI();
  renderSavedTags();
}
function renderHotkeys() {
  $('#wbv-hotkeys-list').html(
    HOTKEYS.map(([k, v]) =>
      `<div class="wbv-hotkey-row"><span class="wbv-hotkey-key">[${k}]</span><span>${v}</span></div>`
    ).join('')
  );
}

function updateMintTokenButtonEnabled() {
  const user = ($('#wbv-wb-user').val() || '').trim();
  const pass = ($('#wbv-wb-password').val() || '').trim();
  $('#wbv-mint-token').prop('disabled', !user || !pass);
}

function updateSaveTokenButtonEnabled() {
  const typed = ($('#wbv-wb-token').val() || '').trim();
  const saved = (getSettings().creds.token || '').trim();
  $('#wbv-save-creds').prop('disabled', !typed || typed === saved);
}

// ── EVENT WIRING ──────────────────────────────────────────────────────────────
function wireEvents() {
  $('#wbv-close-btn').on('click', closeOverlay);
  $('#wbv-panels-btn').on('click', togglePanels);
  // Brand header behavior:
  //   - Desktop: opens https://weybooru.com in a new tab (it's a clickable link)
  //   - Mobile:  brings up the settings/menu pane (matches Mika's downloader UX)
  $('#wbv-brand-header').on('click', () => {
    if (window.innerWidth <= 900) {
      window.wbv_setMobileView('menu');
    } else {
      window.open('https://weybooru.com', '_blank', 'noopener,noreferrer');
    }
  });

  $('#wbv-search-btn').on('click', () => doSearch());
  $('#wbv-search').on('keydown', e => { if (e.key === 'Enter') doSearch(); });
  $('#wbv-search').on('input', updateCharHint);
  $('#wbv-search-help-btn').on('click', () => openSearchHelp());
  $('#wbv-search-help-close').on('click', () => closeSearchHelp());
  $('#wbv-search-help-pop').on('click', e => {
    if ($(e.target).closest('.wbv-search-help-dialog').length) return;
    closeSearchHelp();
  });
  $('#wbv-sort').on('change', () => {
    if (state.didSearch && !state.showFavs) void doSearch();
    else persistFromUI();
  });

  $('#wbv-first-btn').on('click', () => go(0));
  $('#wbv-prev-btn').on('click', prev);
  $('#wbv-next-btn').on('click', next);
  $('#wbv-last-btn').on('click', () => go(getDisplayPosts().length - 1));
  $('#wbv-play-btn').on('click', togglePlay);
  $('#wbv-fav-btn').on('click', () => { void toggleFav(); });
  $('#wbv-like-btn').on('click', () => { void toggleLike(); });

  $('#wbv-tagvote-bar-btn').on('click', e => {
    e.stopPropagation();
    const tr = state.tagReview;
    if (!tr.suggestions.length) return;
    const wasExpanded = tr.expanded;
    tr.expanded = !tr.expanded;
    tagReviewSetPanelPref(tr.expanded ? 'open' : 'close');
    if (wasExpanded && !tr.expanded) pulseTagVoteBarBtn();
    syncTagReviewDom();
  });
  $('#wbv-tagvote-minimize').on('click', e => {
    e.stopPropagation();
    if (tagReviewAutoMinTimer) {
      clearTimeout(tagReviewAutoMinTimer);
      tagReviewAutoMinTimer = null;
    }
    const tr = state.tagReview;
    const wasExpanded = tr.expanded;
    tr.expanded = false;
    tagReviewSetPanelPref('close');
    if (wasExpanded) pulseTagVoteBarBtn();
    syncTagReviewDom();
  });
  $('#wbv-tagvote-prev').on('click', e => { e.stopPropagation(); tagReviewNavigate(-1); });
  $('#wbv-tagvote-next').on('click', e => { e.stopPropagation(); tagReviewNavigate(1); });
  $('#wbv-tagvote-for').on('click', e => { e.stopPropagation(); void submitTagReviewVote('for'); });
  $('#wbv-tagvote-against').on('click', e => { e.stopPropagation(); void submitTagReviewVote('against'); });

  $('#wbv-clear-hist-btn').on('click', () => {
    state.history = [];
    persistFromUI();
    renderHistory();
  });
  $('#wbv-save-creds').on('click', () => {
    const s = getSettings();
    const typedUser = $('#wbv-wb-user').val().trim();
    if (typedUser) s.creds.tokenUser = typedUser;
    state.authUsername = typedUser || (s.creds.tokenUser || '').trim();
    s.creds.username = '';
    s.creds.token = $('#wbv-wb-token').val().trim();
    szuruDidBumpLogin = false;
    saveSettingsDebounced();
    $('#wbv-creds-saved').addClass('wbv-show');
    setTimeout(() => $('#wbv-creds-saved').removeClass('wbv-show'), 2000);
    updateSaveTokenButtonEnabled();
    if (state.open && (state.didSearch || state.showFavs)) renderLikeBtn();
  });
  $('#wbv-mint-token').on('click', async () => {
    const user = $('#wbv-wb-user').val().trim();
    const pass = $('#wbv-wb-password').val();
    if (!user || !pass) {
      window.alert('Enter username and password to generate a token.');
      return;
    }
    const base = apiRootTrimmed();
    const auth = `Basic ${btoa(unescape(encodeURIComponent(`${user}:${pass}`)))}`;
    try {
      const r = await fetch(`${base}/user-token/${encodeURIComponent(user)}`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: auth,
        },
        body: JSON.stringify({ note: 'SillyTavern Weybooru Viewer' }),
      });
      const text = await r.text();
      let body = null;
      try {
        body = text ? JSON.parse(text) : null;
      } catch {
        body = null;
      }
      if (!r.ok) {
        throw new Error(body?.description || body?.title || `HTTP ${r.status}`);
      }
      $('#wbv-wb-token').val(body?.token || '');
      $('#wbv-wb-password').val('');
      $('#wbv-wb-user').val('');
      updateMintTokenButtonEnabled();
      const s = getSettings();
      state.authUsername = user;
      s.creds.tokenUser = user;
      s.creds.username = '';
      s.creds.token = (body?.token || '').trim();
      s.apiRoot = base;
      szuruDidBumpLogin = false;
      saveSettingsDebounced();
      $('#wbv-creds-saved').addClass('wbv-show');
      setTimeout(() => $('#wbv-creds-saved').removeClass('wbv-show'), 2000);
      updateSaveTokenButtonEnabled();
      if (state.open && (state.didSearch || state.showFavs)) renderLikeBtn();
    } catch (e) {
      console.error('[Weybooru Viewer] mint token', e);
      window.alert('Could not create token: ' + (e.message || e));
    }
  });
  $('#wbv-wb-user, #wbv-wb-password').on('input change', updateMintTokenButtonEnabled);
  $('#wbv-wb-token').on('input change', updateSaveTokenButtonEnabled);
  updateMintTokenButtonEnabled();
  updateSaveTokenButtonEnabled();
  $('#wbv-view-favs-btn').on('click', () => {
    if (!state.favPosts.length) return;
    state.showFavs = true;
    state.currentIdx = 0;
    if (window.innerWidth <= 900) window.wbv_setMobileView('main');
    showState('results');
    renderViewer();
  });
  $('#wbv-exit-favs-btn').on('click', () => {
    state.showFavs = false;
    state.currentIdx = 0;
    renderViewer();
  });
  $('#wbv-add-tag-btn').on('click', addSavedTag);

  $('#wbv-image-tags-btn').on('click', e => {
    e.stopPropagation();
    state.imageTagsOpen = !state.imageTagsOpen;
    syncImageTagsPanelFromState();
  });

  $('#wbv-image-uploader-btn').on('click', e => {
    e.preventDefault();
    e.stopPropagation();
    const name = ($('#wbv-image-uploader-btn').attr('data-wbv-uploader') || '').trim();
    if (!name) return;
    const q = buildUploaderSearchQuery(name);
    if (q) void doSearch(q);
  });

  $('#wbv-image-tags-list').on('click', '.wbv-image-tags-item', function (e) {
    e.preventDefault();
    e.stopPropagation();
    const tag = $(this).text();
    if (!tag) return;
    if (e.ctrlKey || e.altKey) {
      const mergedQ = appendNegatedSearchToken($('#wbv-search').val(), tag);
      void doSearch(mergedQ);
      return;
    }
    if (e.shiftKey) {
      const mergedQ = appendUniqueSpaceToken($('#wbv-search').val(), tag);
      void doSearch(mergedQ);
      return;
    }
    void doSearch(tag);
  });

  $('#wbv-hotkeys-toggle').on('click', () => {
    const body = $('#wbv-hotkeys-body');
    const arrow = $('#wbv-hotkeys-arrow');
    const open = body.toggleClass('wbv-open').hasClass('wbv-open');
    arrow.toggleClass('wbv-open', open);
  });

  // persist prefs whenever they change; media + rating filters re-run the active search
  $('#wbv-modal-overlay').on('change',
    '#wbv-autofit, #wbv-f-images, #wbv-f-gifs, #wbv-f-videos, #wbv-r-s, #wbv-r-q, #wbv-r-e, #wbv-slide-secs',
    e => {
      persistFromUI();
      const id = e.target?.id;
      if (state.didSearch && !state.showFavs && (
        id === 'wbv-f-images' || id === 'wbv-f-gifs' || id === 'wbv-f-videos' ||
        id === 'wbv-r-s' || id === 'wbv-r-q' || id === 'wbv-r-e'
      )) void doSearch();
    }
  );
  $('#wbv-blacklist').on('input', () => {
    if (wbvBlacklistSearchTimer) clearTimeout(wbvBlacklistSearchTimer);
    wbvBlacklistSearchTimer = setTimeout(() => {
      wbvBlacklistSearchTimer = null;
      if (state.didSearch && !state.showFavs) void doSearch();
    }, 2000);
  });
  $('#wbv-blacklist').on('blur', () => persistFromUI());

  // re-render viewer when autofit toggled
  $('#wbv-autofit').on('change', () => { if (state.didSearch || state.showFavs) renderViewer(); });

  // mobile touch zones — left half = prev, right half = next
  // (delegated to img-area's pseudo-elements via real button click handlers)
  $('#wbv-img-area').on('click', e => {
    if (window.innerWidth > 900) return;
    // ignore clicks on the control bar
    if ($(e.target).closest('#wbv-ctrl-bar').length) return;
    if ($(e.target).closest('#wbv-image-tags-float').length) return;
    if ($(e.target).closest('#wbv-tagvote-root').length) return;
    if ($(e.target).closest('#wbv-image-uploader-btn').length) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    if (x < rect.width * 0.3) prev();
    else if (x > rect.width * 0.7) next();
  });
}

// ── KEYBOARD ──────────────────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (!state.open) return;
  if (!$('#wbv-search-help-pop').hasClass('wbv-hidden')) {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeSearchHelp();
    }
    return;
  }
  const tag = e.target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.target.blur();
    }
    return;
  }
  switch (e.key) {
    case 'ArrowLeft': case 'a': case 'A': e.preventDefault(); prev(); break;
    case 'ArrowRight': case 'd': case 'D': e.preventDefault(); next(); break;
    case 'w': case 'W': e.preventDefault(); jump(-10); break;
    case 's': case 'S': e.preventDefault(); jump(10); break;
    case ' ': e.preventDefault(); togglePlay(); break;
    case 'f': case 'F': {
      const af = $('#wbv-autofit');
      af.prop('checked', !af.prop('checked'));
      renderViewer();
      persistFromUI();
      break;
    }
    case 'e': case 'E': {
      const p = getDisplayPosts()[state.currentIdx];
      if (p) window.open(p.source_url, '_blank');
      break;
    }
    case 'g': case 'G': void toggleFav(); break;
    case 'l': case 'L': void toggleLike(); break;
    case 'z': case 'Z': e.preventDefault(); togglePanels(); break;
    case 'Escape': e.preventDefault(); closeOverlay(); break;
  }
});

// =============================================================================
// ST HAMBURGER MENU INJECTION
// -----------------------------------------------------------------------------
// Mounts a "Weybooru" entry into ST's hamburger menu (#options), styled to
// blend in with siblings like Author's Note, CFG Scale, etc.
//
// IMPORTANT FOR FORKS / MAINTAINERS:
// ST's #options menu items don't share a single canonical class — different
// versions and forks structure them differently. Rather than clone an existing
// item (which can pick up unwanted styling), we look at the real items' inner
// HTML structure and replicate it verbatim. Most ST versions use:
//   <a class="interactable"> <i class="fa-solid fa-X"></i> <span>Label</span> </a>
//
// If your fork uses a different structure and the menu item ever looks wrong,
// inspect a sibling item in DevTools, then mirror its tag + class pattern in
// `injectMenuItem()` below.
// =============================================================================

let wbvQrBarObserver = null;
let wbvQrBarObserved = null;
const wbvReinjectDelayIds = [];
let wbvSendFormObs = null;
let wbvBodyObs = null;
let wbvPlacementDebounce = 0;

function getQrRoot() {
  return document.getElementById('qr--bar') || document.getElementById('qr--popout');
}

/** Docked bar lives under #send_form; popout is appended to body — watch both for mode toggles. */
function bindQrPlacementWatch() {
  const bump = () => {
    clearTimeout(wbvPlacementDebounce);
    wbvPlacementDebounce = setTimeout(() => scheduleMenuReinject(), 60);
  };
  const sendForm = document.getElementById('send_form');
  if (sendForm && !wbvSendFormObs) {
    wbvSendFormObs = new MutationObserver(bump);
    wbvSendFormObs.observe(sendForm, { childList: true, subtree: true });
  }
  if (!wbvBodyObs) {
    wbvBodyObs = new MutationObserver(mutations => {
      for (const m of mutations) {
        for (const n of m.addedNodes) {
          if (n.nodeType === 1 && (n.id === 'qr--popout' || n.matches?.('#qr--popout'))) {
            bump();
            return;
          }
        }
        for (const n of m.removedNodes) {
          if (n.nodeType === 1 && n.id === 'qr--popout') {
            bump();
            return;
          }
        }
      }
    });
    wbvBodyObs.observe(document.body, { childList: true });
  }
}

/** Watch the active QR root (#qr--bar or #qr--popout) so inner rebuilds re-trigger injection. */
function bindQrBarMutationWatch() {
  const bar = getQrRoot();
  if (!bar) return false;
  if (wbvQrBarObserved === bar && wbvQrBarObserver) return true;
  wbvQrBarObserver?.disconnect();
  wbvQrBarObserved = bar;
  wbvQrBarObserver = new MutationObserver(() => {
    const menu = document.querySelector('#qr--bar .qr--buttons')
      ?? document.querySelector('#qr--popout .qr--buttons');
    if (menu && !menu.querySelector('#wbv-menu-item')) injectMenuItem();
    const root = getQrRoot();
    if (root && root !== wbvQrBarObserved) bindQrBarMutationWatch();
  });
  wbvQrBarObserver.observe(bar, { childList: true, subtree: true });
  return true;
}

/**
 * Chat switches rebuild the QR bar asynchronously; lifecycle events often fire
 * before the new DOM exists. Flush on microtask / animation frames / timers.
 */
function scheduleMenuReinject() {
  for (const id of wbvReinjectDelayIds) clearTimeout(id);
  wbvReinjectDelayIds.length = 0;
  const run = () => {
    injectMenuItem();
    bindQrPlacementWatch();
    bindQrBarMutationWatch();
  };
  queueMicrotask(run);
  requestAnimationFrame(() => {
    run();
    requestAnimationFrame(run);
  });
  for (const ms of [120, 300, 700, 1500, 2800]) {
    wbvReinjectDelayIds.push(setTimeout(run, ms));
  }
}

function injectMenuItem() {
  // ST shows either docked #qr--bar or floating #qr--popout, not both (see ButtonUi.refresh).
  const menu = document.querySelector('#qr--bar .qr--buttons')
    ?? document.querySelector('#qr--popout .qr--buttons');
  if (!menu) return false;
  if (menu.querySelector('#wbv-menu-item')) {
    bindQrPlacementWatch();
    bindQrBarMutationWatch();
    return true;
  }

  const template = `
    <div id="wbv-menu-item" class="qr--button menu_button interactable" title="Weybooru Viewer" tabindex="0">
      <div class="qr--button-icon fa-solid fa-images"></div>
      <div class="qr--button-label qr--hidden">Weybooru Viewer</div>
      <div class="qr--button-expander" title="Open context menu">⋮</div>
    </div>`;
  const item = $(template);

  // Append rather than prepend — feels less aggressive than jumping to the top,
  // and matches where 3rd-party extensions usually land
  menu.appendChild(item[0]);

  item.on('click', e => {
    e.preventDefault();
    e.stopPropagation();
    openOverlay();
  });
  bindQrPlacementWatch();
  bindQrBarMutationWatch();
  return true;
}

// Floating fallback button — only appears if menu injection fails completely
// (e.g. ST fork doesn't have an #options menu at all)
function injectFallbackButton() {
  if ($('#wbv-fallback-btn').length) return;
  const btn = $(`<div id="wbv-fallback-btn" title="Open Weybooru Viewer"
    style="position:fixed;top:10px;right:10px;z-index:9998;padding:8px 12px;
    background:#181818;border:1px solid #333;border-radius:4px;color:#f7a8c0;
    cursor:pointer;font-size:18px;"><i class="fa-solid fa-images"></i></div>`);
  btn.on('click', openOverlay);
  $('body').append(btn);
}

// Retry injection a few times since the hamburger menu may not be in the DOM
// at boot time — ST builds it lazily in some versions
function setupLaunchEntry() {
  let tries = 0;
  const tryInject = () => {
    tries++;
    if (injectMenuItem()) return;
    if (tries < 10) setTimeout(tryInject, 500);
    else injectFallbackButton();  // give up, drop a floating button instead
  };
  tryInject();
  // First paint: QR bar sometimes materializes after our boot delay / retries.
  scheduleMenuReinject();

  // Switching chats rebuilds the QR bar and drops our injected control; ST
  // often finishes that after CHAT_CHANGED / CHAT_LOADED (see scheduleMenuReinject).
  eventSource.on(event_types.CHAT_CHANGED, scheduleMenuReinject);
  eventSource.on(event_types.CHAT_LOADED, scheduleMenuReinject);

  bindQrPlacementWatch();

  // Some ST themes/forks rebuild the menu after navigation. Watch for that
  // and re-inject if our item disappears.
  const target = document.getElementById('options');
  if (target) {
    const observer = new MutationObserver(() => {
      if (!$('#wbv-menu-item').length && $('#options').length) {
        injectMenuItem();
      }
    });
    observer.observe(target, { childList: true });
  }
}

// ── SLASH COMMAND ─────────────────────────────────────────────────────────────
// Registers `/weybooru [tags]` so users can open the viewer from the chat
// input. ST's slash command API has shifted across versions, so we try the
// modern path first and fall back to the legacy global if needed.
function registerSlashCommand() {
  try {
    const ctx = SillyTavern.getContext();
    if (ctx?.SlashCommandParser?.addCommandObject && ctx?.SlashCommand?.fromProps) {
      const cmd = ctx.SlashCommand.fromProps({
        name: 'weybooru',
        callback: (_, value) => {
          const v = typeof value === 'string' ? value.trim() : (value != null ? String(value).trim() : '');
          void openOverlay(v || undefined);
          return '';
        },
        helpString: 'Open the Weybooru viewer. Optional argument is a tag query.',
      });
      ctx.SlashCommandParser.addCommandObject(cmd);
    } else if (window.registerSlashCommand) {
      window.registerSlashCommand('weybooru', (_, value) => {
        const v = value != null ? String(value).trim() : '';
        void openOverlay(v || undefined);
        return '';
      }, [], 'Open the Weybooru viewer with optional tag query.', true, true);
    }
  } catch (e) {
    console.warn('[Weybooru Viewer] slash command registration failed:', e);
  }
}

// ── BOOT ──────────────────────────────────────────────────────────────────────
jQuery(async () => {
  console.debug(`[${WBV_MODULE_NAME}] Initializing v${EXT_VERSION}`);
  getSettings();
  setTimeout(() => {
    setupLaunchEntry();
    registerSlashCommand();
  }, 300);
});
