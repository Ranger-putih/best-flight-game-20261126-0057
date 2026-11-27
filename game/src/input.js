// Keyboard and mouse input for Merapi Airlift. Held keys steer the plane; one-shot
// presses (start, pause, camera, mute) are queued as bit flags and taken once by the
// loop, so a press between two frames is never lost and never counted twice. The mouse
// drags the chase camera around the plane and a click confirms on menus.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_CAMERA = 4;
export const ACTION_MUTE = 8;
export const ACTION_RESTART = 16;

const THROTTLE_UP = new Set(['KeyW', 'ShiftLeft', 'ShiftRight']);
const THROTTLE_DOWN = new Set(['KeyS', 'ControlLeft', 'ControlRight']);
const PITCH_UP = new Set(['ArrowUp']);
const PITCH_DOWN = new Set(['ArrowDown']);
const ROLL_LEFT = new Set(['ArrowLeft', 'KeyA']);
const ROLL_RIGHT = new Set(['ArrowRight', 'KeyD']);
const YAW_LEFT = new Set(['KeyQ']);
const YAW_RIGHT = new Set(['KeyE']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const CAMERA = new Set(['KeyC']);
const MUTE = new Set(['KeyM']);
const RESTART = new Set(['KeyR']);

export function createInput(target) {
  const held = new Set();
  let actions = 0;
  let lookYaw = 0;
  let lookPitch = 0;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  window.addEventListener('keydown', (event) => {
    if (CONFIRM.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CONFIRM;
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else if (CAMERA.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CAMERA;
    } else if (MUTE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_MUTE;
    } else if (RESTART.has(event.code)) {
      if (!event.repeat) actions |= ACTION_RESTART;
    } else {
      held.add(event.code);
    }
    if (event.code.startsWith('Arrow') || event.code === 'Space') event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    held.delete(event.code);
  });
  // A key released while the tab is hidden never sends keyup: let go of everything on blur.
  window.addEventListener('blur', () => {
    held.clear();
    dragging = false;
  });

  target.addEventListener('pointerdown', (event) => {
    dragging = true;
    lastX = event.clientX;
    lastY = event.clientY;
    actions |= ACTION_CONFIRM;
  });
  window.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    lookYaw -= (event.clientX - lastX) * 0.004;
    lookPitch -= (event.clientY - lastY) * 0.003;
    lookPitch = Math.max(-0.5, Math.min(0.5, lookPitch));
    lastX = event.clientX;
    lastY = event.clientY;
  });
  window.addEventListener('pointerup', () => {
    dragging = false;
  });

  function any(keys) {
    for (const code of keys) if (held.has(code)) return true;
    return false;
  }

  return {
    /** -1..1 throttle change: W/Shift up, S/Ctrl down. */
    throttleAxis() {
      return (any(THROTTLE_UP) ? 1 : 0) - (any(THROTTLE_DOWN) ? 1 : 0);
    },
    /** -1 (nose down) .. 1 (nose up). ArrowUp climbs, like an arcade stick. */
    pitchAxis() {
      return (any(PITCH_UP) ? 1 : 0) - (any(PITCH_DOWN) ? 1 : 0);
    },
    /** -1 (left) .. 1 (right). */
    rollAxis() {
      return (any(ROLL_RIGHT) ? 1 : 0) - (any(ROLL_LEFT) ? 1 : 0);
    },
    /** Rudder: Q left, E right. */
    yawAxis() {
      return (any(YAW_RIGHT) ? 1 : 0) - (any(YAW_LEFT) ? 1 : 0);
    },
    /** Mouse-look offsets the camera reads (radians); they ease back to centre. */
    look() {
      return { yaw: lookYaw, pitch: lookPitch };
    },
    recenterLook() {
      lookYaw = 0;
      lookPitch = 0;
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
