import { createAc2Host } from './ac2-host.js';
import { createVrmScene } from './vrm-scene.js';

const ac2Host = createAc2Host({
  tenantId: 'viverse',
  apiBase: 'https://ac2-host-api-avatar-page.kuanyi-lien.workers.dev',
  ac2Origin: 'https://geosephlien.github.io',
  ac2Url: 'https://geosephlien.github.io/ac2/?embedded=1&uiMode=modal',
  openButton: document.getElementById('open-ac2-button'),
  modal: document.getElementById('ac2-modal'),
  frame: document.getElementById('ac2-frame'),
  sessionStatus: document.getElementById('session-status')
});

const vrmScene = createVrmScene({
  canvas: document.getElementById('host-scene'),
  avatarStatus: document.getElementById('avatar-status')
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
    await vrmScene.loadInitialAvatar(
      () => ac2Host.fetchVrmFiles(),
      () => ac2Host.fetchActiveAvatar(),
      (key) => ac2Host.fetchDownloadUrl(key)
    );
  } catch (error) {
    console.error(error);
    vrmScene.setAvatarText('Unable to load initial avatar: ' + error.message);
  }
}
