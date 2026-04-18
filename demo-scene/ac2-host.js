const DEFAULT_FRAME_STYLE = {
  source: 'partner-host',
  placement: 'center',
  breakpoint: 960,
  panelWidth: 1280,
  panelHeight: 780,
  panelRadius: 28,
  mobilePanelWidth: null,
  mobilePanelHeight: 780,
  mobilePanelRadius: 22,
  padding: {
    top: 32,
    right: 32,
    bottom: 32,
    left: 32
  },
  mobilePadding: {
    top: 16,
    right: 0,
    bottom: 16,
    left: 0
  },
  backdrop: 'rgba(4, 7, 20, 0.58)',
  backdropFilter: 'blur(12px)',
  panelBackground: 'rgba(11, 14, 40, 0.96)',
  frameBackground: '#050814',
  border: '1px solid rgba(255, 255, 255, 0.18)'
};

export function createAc2Host(options) {
  const {
    tenantId,
    apiBase,
    ac2Origin,
    ac2Url,
    openButton,
    modal,
    frame,
    sessionStatus,
    locale = document.documentElement.lang || 'en',
    frameStyle = DEFAULT_FRAME_STYLE
  } = options;

  const avatarSelectedHandlers = new Set();
  const readyHandlers = new Set();
  const errorHandlers = new Set();

  let ac2Ready = false;
  let launchPending = false;
  let ac2RequestId = null;
  let sessionPayload = null;
  let sessionRequestPromise = null;

  function setSessionText(value) {
    if (sessionStatus) {
      sessionStatus.textContent = value;
    }
  }

  function emit(handlers, payload) {
    handlers.forEach((handler) => {
      try {
        handler(payload);
      } catch (error) {
        console.error(error);
      }
    });
  }

  function emitError(error) {
    emit(errorHandlers, error);
  }

  function buildInitPayload(session) {
    return Object.assign({}, session, {
      apiBase,
      uiMode: 'modal',
      locale,
      autoStart: false,
      frameStyle
    });
  }

  async function requestSession() {
    const response = await fetch(apiBase + '/api/ac2/session', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        tenantId,
        domain: window.location.origin
      })
    });

    if (!response.ok) {
      throw new Error('Failed to create AC2 session (' + response.status + ')');
    }

    return response.json();
  }

  async function ensureSession() {
    if (sessionPayload && sessionPayload.sessionToken) {
      return sessionPayload;
    }

    if (sessionRequestPromise) {
      return sessionRequestPromise;
    }

    setSessionText('Requesting AC2 session...');
    sessionRequestPromise = requestSession()
      .then((session) => {
        sessionPayload = buildInitPayload(session);
        setSessionText('Session ready for tenant ' + (sessionPayload.tenantId || tenantId));
        emit(readyHandlers, sessionPayload);
        return sessionPayload;
      })
      .catch((error) => {
        setSessionText('Session failed: ' + error.message);
        emitError(error);
        throw error;
      })
      .finally(() => {
        sessionRequestPromise = null;
      });

    return sessionRequestPromise;
  }

  async function authorizedGet(path) {
    const session = await ensureSession();
    return fetch(apiBase + path, {
      method: 'GET',
      credentials: 'include',
      headers: {
        Authorization: 'Bearer ' + session.sessionToken
      }
    });
  }

  async function fetchVrmFiles() {
    const response = await authorizedGet('/api/ac2/files');
    if (!response.ok) {
      throw new Error('Failed to fetch VRM files (' + response.status + ')');
    }
    return response.json();
  }

  async function fetchDownloadUrl(key, expiresIn = 3600) {
    const response = await authorizedGet(
      '/api/ac2/download-url?key=' + encodeURIComponent(key) + '&expiresIn=' + encodeURIComponent(expiresIn)
    );
    if (!response.ok) {
      throw new Error('Failed to create download URL (' + response.status + ')');
    }
    return response.json();
  }

  async function fetchAnimationUrl(name, expiresIn = 3600) {
    const response = await authorizedGet(
      '/api/ac2/animation-url?name=' + encodeURIComponent(name) + '&expiresIn=' + encodeURIComponent(expiresIn)
    );
    if (!response.ok) {
      throw new Error('Failed to create animation URL (' + response.status + ')');
    }
    return response.json();
  }

  async function fetchActiveAvatar() {
    const response = await authorizedGet('/api/ac2/active-avatar');
    if (!response.ok) {
      return null;
    }
    const data = await response.json();
    return data.key || null;
  }

  async function saveActiveAvatar(key) {
    const session = await ensureSession();
    const response = await fetch(apiBase + '/api/ac2/active-avatar', {
      method: 'PUT',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + session.sessionToken
      },
      body: JSON.stringify({ key })
    });

    if (!response.ok) {
      throw new Error('Failed to save active avatar (' + response.status + ')');
    }
  }

  function openModal() {
    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
  }

  function close(options = {}) {
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
    launchPending = false;
    ac2RequestId = null;

    if (options.reset !== false) {
      ac2Ready = false;
      frame.removeAttribute('src');
    }
  }

  function sendInit() {
    if (!ac2Ready || !sessionPayload || !frame.contentWindow) {
      return;
    }

    frame.contentWindow.postMessage({
      type: 'ac2:init',
      requestId: ac2RequestId,
      payload: sessionPayload
    }, ac2Origin);
  }

  async function open() {
    if (openButton) {
      openButton.disabled = true;
    }

    try {
      await ensureSession();
      ac2RequestId = 'partner-host-' + Date.now();
      launchPending = true;
      openModal();
      if (frame.src !== ac2Url) {
        frame.src = ac2Url;
      } else if (ac2Ready) {
        sendInit();
      }
    } catch (error) {
      emitError(error);
      throw error;
    } finally {
      if (openButton) {
        openButton.disabled = false;
      }
    }
  }

  function onAvatarSelected(handler) {
    avatarSelectedHandlers.add(handler);
    return () => avatarSelectedHandlers.delete(handler);
  }

  function onReady(handler) {
    readyHandlers.add(handler);
    return () => readyHandlers.delete(handler);
  }

  function onError(handler) {
    errorHandlers.add(handler);
    return () => errorHandlers.delete(handler);
  }

  if (openButton) {
    openButton.addEventListener('click', () => {
      open().catch((error) => {
        setSessionText('AC2 open failed: ' + error.message);
      });
    });
  }

  modal.addEventListener('click', (event) => {
    if (event.target instanceof Element && event.target.hasAttribute('data-ac2-close')) {
      close();
    }
  });

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !modal.hidden) {
      close();
    }
  });

  window.addEventListener('message', (event) => {
    if (event.origin !== ac2Origin) {
      return;
    }

    const message = event.data || {};
    if (!message.type) {
      return;
    }

    if (message.type === 'ac2:ready') {
      ac2Ready = true;
      if (launchPending) {
        sendInit();
      }
      return;
    }

    if (message.type === 'ac2:init-ack') {
      launchPending = false;
      return;
    }

    if (message.type === 'ac2:avatar-selected') {
      emit(avatarSelectedHandlers, message.payload || {});
      return;
    }

    if (message.type === 'ac2:close-request') {
      close({ reset: false });
      return;
    }

    if (message.type === 'ac2:error' || message.type === 'ac2:blocked') {
      const error = new Error('AC2 host event: ' + JSON.stringify(message.payload || {}));
      console.error(error);
      emitError(error);
    }
  });

  return {
    close,
    ensureSession,
    fetchActiveAvatar,
    fetchAnimationUrl,
    fetchDownloadUrl,
    fetchVrmFiles,
    onAvatarSelected,
    onError,
    onReady,
    open,
    saveActiveAvatar,
    setSessionText
  };
}
