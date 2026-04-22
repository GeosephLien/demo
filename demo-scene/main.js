import { createAc2Host } from './ac2-host.js';
import { createVrmScene } from './vrm-scene.js';

const urlParams = new URLSearchParams(window.location.search);
const runtimeConfig = window.__AC2_RUNTIME__ && typeof window.__AC2_RUNTIME__ === 'object'
  ? window.__AC2_RUNTIME__
  : {};

function readRuntimeValue(name) {
  const queryValue = urlParams.get(name);
  if (typeof queryValue === 'string' && queryValue.trim()) {
    return queryValue.trim();
  }

  const configValue = runtimeConfig[name];
  if (typeof configValue === 'string' && configValue.trim()) {
    return configValue.trim();
  }

  return '';
}

function normalizeUrl(value, fallback) {
  try {
    return new URL(String(value || '')).toString();
  } catch {
    return fallback;
  }
}

function normalizeOrigin(value, fallback) {
  try {
    const parsed = new URL(String(value || ''));
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return fallback;
    }
    return parsed.origin;
  } catch {
    return fallback;
  }
}

const tenantId = (urlParams.get('tenant') || 'viverse').trim() || 'viverse';
const defaultSiteOrigin = 'https://geosephlien.github.io';
const defaultAc2Url = `${defaultSiteOrigin}/ac2/?embedded=1&uiMode=modal`;
const ac2Url = normalizeUrl(readRuntimeValue('ac2Url'), defaultAc2Url);
const ac2Origin = normalizeOrigin(readRuntimeValue('ac2Origin'), normalizeOrigin(ac2Url, defaultSiteOrigin));

const ac2Host = createAc2Host({
  tenantId,
  apiBase: readRuntimeValue('apiBase') || 'https://ac2-host-api-avatar-page.kuanyi-lien.workers.dev',
  ac2Origin,
  ac2Url,
  openButton: document.getElementById('open-ac2-button'),
  modal: document.getElementById('ac2-modal'),
  frame: document.getElementById('ac2-frame'),
  sessionStatus: document.getElementById('session-status')
});

const overlayTitle = document.querySelector('.overlay-title');
if (overlayTitle) {
  overlayTitle.textContent = `${tenantId} VRM Host`;
}

const vrmScene = createVrmScene({
  canvas: document.getElementById('host-scene'),
  avatarStatus: document.getElementById('avatar-status'),
  setLoadingState: createSceneLoadingController(
    document.getElementById('scene-loading'),
    document.getElementById('scene-loading-text')
  )
});

vrmScene.start({
  resolveAnimationUrl: (name) => ac2Host.fetchAnimationUrl(name),
  resolveDownloadUrl: (key) => ac2Host.fetchDownloadUrl(key)
});

ac2Host.onAvatarSelected(async (selection) => {
  const nextKey = selection && selection.key ? selection.key : '';
  const nextName = selection.fileName || selection.label || nextKey || 'avatar.vrm';

  try {
    await vrmScene.loadAvatarFromSelection(selection, (key) => ac2Host.fetchDownloadUrl(key));
    if (nextKey) {
      await ac2Host.saveActiveAvatar(nextKey);
    }
  } catch (error) {
    console.error(error);
    vrmScene.setAvatarText(nextName + ' failed: ' + error.message);
  }
});

ac2Host.onError((error) => {
  console.error(error);
});

initialize();

async function initialize() {
  try {
    await ac2Host.ensureSession();
    const hasAvatar = await vrmScene.loadInitialAvatar(
      () => ac2Host.fetchVrmFiles(),
      () => ac2Host.fetchActiveAvatar(),
      (key) => ac2Host.fetchDownloadUrl(key)
    );
    if (!hasAvatar) {
      await ac2Host.open();
    }
  } catch (error) {
    console.error(error);
    vrmScene.setAvatarText('Unable to load initial avatar: ' + error.message);
  }
}

function createSceneLoadingController(overlay, text) {
  let activeCount = 0;

  return function setLoadingState(isLoading, message) {
    if (!overlay) {
      return;
    }

    if (isLoading) {
      activeCount += 1;
      overlay.hidden = false;
      if (text) {
        text.textContent = message || 'Loading avatar...';
      }
      return;
    }

    activeCount = Math.max(0, activeCount - 1);
    if (activeCount === 0) {
      overlay.hidden = true;
      if (text) {
        text.textContent = 'Loading avatar...';
      }
    }
  };
}
