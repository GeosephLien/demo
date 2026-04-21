import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { VRMAnimationLoaderPlugin, createVRMAnimationClip } from '@pixiv/three-vrm-animation';

export function createVrmScene(options) {
  const { canvas, avatarStatus } = options;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  renderer.setSize(window.innerWidth, window.innerHeight, false);

  const clock = new THREE.Clock();
  const loader = new GLTFLoader();
  loader.crossOrigin = 'anonymous';
  loader.register((parser) => new VRMLoaderPlugin(parser));

  const avatarAnchor = new THREE.Group();
  const avatarVisualRoot = new THREE.Group();
  const cameraTarget = new THREE.Vector3(0, 1.35, 0);
  const desiredCameraTarget = new THREE.Vector3(0, 1.35, 0);
  const desiredCameraPosition = new THREE.Vector3();
  const worldUp = new THREE.Vector3(0, 1, 0);

  avatarAnchor.add(avatarVisualRoot);
  scene.add(avatarAnchor);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x2a3552, 2.8));
  const directionalLight = new THREE.DirectionalLight(0xffffff, 1.35);
  directionalLight.position.set(4, 7, 5);
  scene.add(directionalLight);

  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(24, 64),
    new THREE.MeshStandardMaterial({
      color: 0x0e1427,
      roughness: 0.9,
      metalness: 0.02
    })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.01;
  scene.add(floor);

  const grid = new THREE.GridHelper(24, 24, 0x4c5c86, 0x1e2740);
  grid.position.y = 0.001;
  scene.add(grid);

  const cameraState = {
    yaw: 0,
    pitch: 0.28,
    distance: 3.35,
    minDistance: 1.75,
    maxDistance: 6.5
  };

  const pointerState = {
    active: false,
    pointerId: null,
    lastX: 0,
    lastY: 0
  };

  const keyState = {
    KeyW: false,
    KeyA: false,
    KeyS: false,
    KeyD: false
  };
  let interactionEnabled = true;

  let currentVrm = null;
  let currentMixer = null;
  let idleAction = null;
  let walkAction = null;
  let isWalkingAnim = false;
  let activeAvatarKey = '';
  let avatarLoadSequence = 0;
  let animationFrameId = 0;
  let animationRunning = false;
  let webglContextLost = false;
  let resolveAnimationUrl = null;
  let currentAvatarMeta = null;

  function setAvatarText(value) {
    if (avatarStatus) {
      avatarStatus.textContent = value;
    }
  }

  function disposeCurrentAvatar() {
    if (!currentVrm) {
      return;
    }

    if (currentMixer) {
      currentMixer.stopAllAction();
      currentMixer = null;
      idleAction = null;
      walkAction = null;
      isWalkingAnim = false;
    }

    avatarVisualRoot.remove(currentVrm.scene);
    VRMUtils.deepDispose(currentVrm.scene);
    currentVrm = null;
  }

  async function loadVrmaForVrm(vrm, loadId) {
    const animLoader = new GLTFLoader();
    animLoader.crossOrigin = 'anonymous';
    animLoader.register((parser) => new VRMAnimationLoaderPlugin(parser));

    async function loadClip(name) {
      const animation = await resolveAnimationUrl(name);
      const gltf = await animLoader.loadAsync(animation.url);
      const vrmAnim = gltf.userData.vrmAnimations && gltf.userData.vrmAnimations[0];
      if (!vrmAnim) {
        return null;
      }
      return createVRMAnimationClip(vrmAnim, vrm);
    }

    const [idleClip, walkClip] = await Promise.all([
      loadClip('idle'),
      loadClip('walk')
    ]);

    if (loadId !== avatarLoadSequence || currentVrm !== vrm) {
      return;
    }

    const mixer = new THREE.AnimationMixer(vrm.scene);
    idleAction = idleClip ? mixer.clipAction(idleClip) : null;
    walkAction = walkClip ? mixer.clipAction(walkClip) : null;

    if (idleAction) {
      idleAction.play();
    }

    currentMixer = mixer;
    isWalkingAnim = false;
  }

  async function loadAvatarFromUrl(url, meta = {}) {
    if (!resolveAnimationUrl) {
      throw new Error('Animation URL resolver is not configured.');
    }

    const loadId = ++avatarLoadSequence;
    setAvatarText('Loading ' + (meta.displayName || meta.key || 'avatar') + '...');
    const hadAvatarBeforeLoad = Boolean(currentVrm);

    const gltf = await loader.loadAsync(url);
    if (loadId !== avatarLoadSequence) {
      return;
    }

    const vrm = gltf.userData.vrm;
    if (!vrm) {
      throw new Error('The selected file is not a VRM.');
    }

    VRMUtils.removeUnnecessaryVertices(gltf.scene);
    VRMUtils.removeUnnecessaryJoints(gltf.scene);

    disposeCurrentAvatar();

    currentVrm = vrm;
    currentAvatarMeta = meta;
    avatarVisualRoot.add(vrm.scene);
    vrm.scene.position.set(0, 0, 0);
    vrm.scene.rotation.set(0, Math.PI, 0);
    if (!hadAvatarBeforeLoad) {
      avatarAnchor.position.set(0, 0, 0);
    }

    activeAvatarKey = meta.key || '';
    setAvatarText(meta.displayName || meta.key || 'Avatar loaded');

    loadVrmaForVrm(vrm, loadId).catch((error) => {
      console.warn('VRMA load error:', error);
    });
  }

  async function loadAvatarFromSelection(selection, resolveDownload) {
    if (!selection) {
      return;
    }

    const nextKey = selection.key || '';
    const nextName = selection.fileName || selection.label || nextKey || 'avatar.vrm';
    let resolvedUrl = selection.url || '';

    if (nextKey) {
      const result = await resolveDownload(nextKey);
      resolvedUrl = result && result.url ? result.url : resolvedUrl;
    }

    if (!resolvedUrl) {
      throw new Error('No VRM URL available for the selected avatar.');
    }

    await loadAvatarFromUrl(resolvedUrl, {
      key: nextKey,
      displayName: nextName
    });
  }

  async function loadInitialAvatar(loadFiles, fetchStoredAvatar, resolveDownload) {
    const result = await loadFiles();
    const files = Array.isArray(result.files) ? result.files.slice() : [];
    if (!files.length) {
      setAvatarText('No VRM files available for this AC2 user yet.');
      return;
    }

    let targetKey = null;
    try {
      targetKey = await fetchStoredAvatar();
    } catch (error) {
      console.warn('Could not fetch active avatar:', error);
    }

    if (!targetKey || !files.some((file) => file.key === targetKey)) {
      files.sort((left, right) => new Date(right.uploadedAt || 0).getTime() - new Date(left.uploadedAt || 0).getTime());
      targetKey = files[0].key;
    }

    const targetFile = files.find((file) => file.key === targetKey) || files[0];
    await loadAvatarFromSelection({
      key: targetFile.key,
      fileName: targetFile.fileName,
      source: 'remote'
    }, resolveDownload);
  }

  async function reloadCurrentAvatar(resolveDownload) {
    if (!activeAvatarKey) {
      return;
    }

    const result = await resolveDownload(activeAvatarKey);
    const resolvedUrl = result && result.url ? result.url : '';
    if (!resolvedUrl) {
      throw new Error('No VRM URL available for the active avatar.');
    }

    await loadAvatarFromUrl(resolvedUrl, {
      key: activeAvatarKey,
      displayName: (currentAvatarMeta && currentAvatarMeta.displayName) || activeAvatarKey
    });
  }

  function setAnimationWalking(walking) {
    if (walking === isWalkingAnim) {
      return;
    }

    isWalkingAnim = walking;
    if (walking) {
      if (idleAction) {
        idleAction.fadeOut(0.2);
      }
      if (walkAction) {
        walkAction.reset().fadeIn(0.2).play();
      }
      return;
    }

    if (walkAction) {
      walkAction.fadeOut(0.2);
    }
    if (idleAction) {
      idleAction.reset().fadeIn(0.2).play();
    }
  }

  function updateMovement(delta) {
    const horizontal = (keyState.KeyD ? 1 : 0) - (keyState.KeyA ? 1 : 0);
    const vertical = (keyState.KeyW ? 1 : 0) - (keyState.KeyS ? 1 : 0);
    setAnimationWalking(Boolean(horizontal || vertical));
    if (!horizontal && !vertical) {
      return;
    }

    const moveDirection = new THREE.Vector3();
    const forward = new THREE.Vector3(-Math.sin(cameraState.yaw), 0, -Math.cos(cameraState.yaw)).normalize();
    const right = new THREE.Vector3().crossVectors(forward, worldUp).normalize();

    moveDirection.addScaledVector(forward, vertical);
    moveDirection.addScaledVector(right, horizontal);

    if (moveDirection.lengthSq() === 0) {
      return;
    }

    moveDirection.normalize();
    avatarAnchor.position.addScaledVector(moveDirection, delta * 2.4);
    avatarVisualRoot.rotation.y = Math.atan2(moveDirection.x, moveDirection.z);
  }

  function updateCamera(delta) {
    desiredCameraTarget.set(
      avatarAnchor.position.x,
      avatarAnchor.position.y + 1.35,
      avatarAnchor.position.z
    );
    cameraTarget.lerp(desiredCameraTarget, 1 - Math.exp(-delta * 10));

    const cosPitch = Math.cos(cameraState.pitch);
    desiredCameraPosition.set(
      cameraTarget.x + Math.sin(cameraState.yaw) * cosPitch * cameraState.distance,
      cameraTarget.y + Math.sin(cameraState.pitch) * cameraState.distance + 0.05,
      cameraTarget.z + Math.cos(cameraState.yaw) * cosPitch * cameraState.distance
    );

    camera.position.lerp(desiredCameraPosition, 1 - Math.exp(-delta * 12));
    camera.lookAt(cameraTarget);
  }

  function animate() {
    animationFrameId = 0;
    if (!animationRunning || webglContextLost) {
      return;
    }

    const delta = Math.min(clock.getDelta(), 0.05);
    updateMovement(delta);
    if (currentMixer) {
      currentMixer.update(delta);
    }
    if (currentVrm) {
      currentVrm.update(delta);
    }
    updateCamera(delta);
    renderer.render(scene, camera);
    animationFrameId = requestAnimationFrame(animate);
  }

  function stopAnimationLoop() {
    animationRunning = false;
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = 0;
    }
  }

  function startAnimationLoop() {
    if (animationRunning || webglContextLost) {
      return;
    }

    animationRunning = true;
    clock.getDelta();
    animationFrameId = requestAnimationFrame(animate);
  }

  function handleResize() {
    if (webglContextLost) {
      return;
    }

    const width = window.innerWidth;
    const height = window.innerHeight;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  }

  canvas.addEventListener('pointerdown', (event) => {
    if (!interactionEnabled) {
      return;
    }

    if (event.button !== 0) {
      return;
    }

    pointerState.active = true;
    pointerState.pointerId = event.pointerId;
    pointerState.lastX = event.clientX;
    pointerState.lastY = event.clientY;
    canvas.classList.add('is-dragging');
    canvas.setPointerCapture(event.pointerId);
  });

  canvas.addEventListener('pointermove', (event) => {
    if (!interactionEnabled) {
      return;
    }

    if (!pointerState.active || event.pointerId !== pointerState.pointerId) {
      return;
    }

    const deltaX = event.clientX - pointerState.lastX;
    const deltaY = event.clientY - pointerState.lastY;
    pointerState.lastX = event.clientX;
    pointerState.lastY = event.clientY;

    cameraState.yaw -= deltaX * 0.006;
    cameraState.pitch = THREE.MathUtils.clamp(cameraState.pitch + deltaY * 0.0045, -0.15, 0.75);
  });

  function releasePointer(event) {
    if (event.pointerId !== pointerState.pointerId) {
      return;
    }

    pointerState.active = false;
    pointerState.pointerId = null;
    canvas.classList.remove('is-dragging');
    if (canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
  }

  canvas.addEventListener('pointerup', releasePointer);
  canvas.addEventListener('pointercancel', releasePointer);

  canvas.addEventListener('wheel', (event) => {
    if (!interactionEnabled) {
      return;
    }

    event.preventDefault();
    cameraState.distance = THREE.MathUtils.clamp(
      cameraState.distance + event.deltaY * 0.0025,
      cameraState.minDistance,
      cameraState.maxDistance
    );
  }, { passive: false });

  window.addEventListener('keydown', (event) => {
    if (!interactionEnabled) {
      return;
    }

    if (Object.prototype.hasOwnProperty.call(keyState, event.code)) {
      keyState[event.code] = true;
    }
  });

  window.addEventListener('keyup', (event) => {
    if (Object.prototype.hasOwnProperty.call(keyState, event.code)) {
      keyState[event.code] = false;
    }
  });

  window.addEventListener('resize', handleResize);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stopAnimationLoop();
      return;
    }
    startAnimationLoop();
  });

  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    webglContextLost = true;
    stopAnimationLoop();
    setAvatarText('WebGL context lost. Attempting to recover...');
  });

  canvas.addEventListener('webglcontextrestored', () => {
    webglContextLost = false;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    handleResize();
    startAnimationLoop();

    if (!activeAvatarKey) {
      return;
    }

    reloadCurrentAvatar((key) => options.resolveDownloadUrl(key))
      .then(() => {
        setAvatarText('Avatar restored after WebGL reset.');
      })
      .catch((error) => {
        console.error(error);
        setAvatarText('WebGL recovered, but avatar reload failed: ' + error.message);
      });
  });

  function start(runtimeOptions = {}) {
    if (runtimeOptions.resolveAnimationUrl) {
      resolveAnimationUrl = runtimeOptions.resolveAnimationUrl;
    }
    if (runtimeOptions.resolveDownloadUrl) {
      options.resolveDownloadUrl = runtimeOptions.resolveDownloadUrl;
    }

    handleResize();
    camera.position.set(0, 1.65, 3.35);
    camera.lookAt(cameraTarget);
    startAnimationLoop();
  }

  function setInteractionEnabled(enabled) {
    interactionEnabled = enabled !== false;
    if (interactionEnabled) {
      return;
    }

    pointerState.active = false;
    pointerState.pointerId = null;
    canvas.classList.remove('is-dragging');
    Object.keys(keyState).forEach((key) => {
      keyState[key] = false;
    });
  }

  function getCurrentAvatarMeta() {
    if (!currentAvatarMeta && !activeAvatarKey) {
      return null;
    }

    return {
      ...(currentAvatarMeta || {}),
      key: activeAvatarKey || (currentAvatarMeta && currentAvatarMeta.key) || ''
    };
  }

  return {
    getCurrentAvatarMeta,
    loadAvatarFromSelection,
    loadAvatarFromUrl,
    loadInitialAvatar,
    reloadCurrentAvatar,
    setInteractionEnabled,
    setAvatarText,
    start
  };
}
