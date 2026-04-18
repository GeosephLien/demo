# AC2 Demo Package

This package contains two versions of the AC2 integration example.

## Folder Overview

### `minimal/`
A minimal AC2 integration example.

Use this version if you only need the core AC2 flow:
- create an AC2 session
- open AC2 in a modal iframe
- receive avatar selection results
- continue with your own app logic

Files:
- `index.html`: Minimal example page
- `ac2-host.js`: Core AC2 integration logic

### `demo-scene/`
A full demo that combines AC2 with a playable VRM scene.

Use this version if you want to see how AC2 can drive a 3D avatar scene:
- open AC2 from the host page
- select an avatar in AC2
- load the selected VRM into a Three.js scene
- move the avatar and orbit the camera

Files:
- `index.html`: Full demo page structure
- `style.css`: Demo scene styles
- `ac2-host.js`: Core AC2 integration logic
- `vrm-scene.js`: Optional Three.js / VRM scene module
- `main.js`: Assembly layer that connects AC2 and the scene

## File Responsibilities

### `ac2-host.js`
This is the core AC2 integration module.

Responsibilities:
- create and manage AC2 sessions
- call AC2-related APIs
- open and close the modal iframe
- communicate with AC2 through `postMessage`
- emit avatar selection results to the host page

This file is the required core of the package.

### `vrm-scene.js`
This is an optional demo module.

Responsibilities:
- initialize the Three.js scene
- load and replace VRM avatars
- load idle and walk animations
- handle camera movement and avatar controls
- recover from WebGL reset events

You can remove this file if you only need AC2 integration.

### `main.js`
This is the assembly layer for the full demo.

Responsibilities:
- initialize `ac2-host.js`
- initialize `vrm-scene.js`
- connect AC2 avatar selection events to scene avatar loading
- coordinate startup flow and status display

### `index.html`
Provides the page structure and required DOM elements.

### `style.css`
Provides the visual styling for the full demo scene.

## Which Version Should I Use?

Use `minimal/` if:
- you only need AC2
- you want the smallest starting point
- you already have your own UI or rendering system

Use `demo-scene/` if:
- you want a complete working demo
- you need a reference for VRM scene integration
- you want to start from an interactive avatar example

## Removing the Scene From the Full Demo

If you start from `demo-scene/` but later decide you only need AC2:

1. Remove `vrm-scene.js`
2. Simplify `main.js` so it only uses `ac2-host.js`
3. Remove scene-related DOM from `index.html`
4. Remove scene-related styles from `style.css`

Keep:
- `ac2-host.js`
- the AC2 modal / iframe structure
- the AC2 open button and any status UI you still need

## Package Naming

The download zip should be named like this:

```text
ac2-<tenantId before @>.zip
```

Example:

```text
tenantId = viverse@example.com
zip name = ac2-viverse.zip
```
