import * as THREE from 'three';

/**
 * Pull `cam` along its direction from `look` so its radius sits inside
 * OrbitControls' [minDistance, maxDistance] dolly range.
 *
 * A fly-to point outside that range can never be reached: every
 * controls.update() re-clamps the camera onto the limit sphere, so an
 * animation rig that waits for "camera close to target" keeps animating
 * forever and overrides all user pan/zoom input. Mutates `cam` in place.
 */
export function clampCamToDollyRange(
  cam: THREE.Vector3,
  look: THREE.Vector3,
  minDistance: number,
  maxDistance: number,
): void {
  const radius = cam.distanceTo(look);
  if (radius === 0) return;
  const clamped = Math.min(Math.max(radius, minDistance), maxDistance);
  if (clamped !== radius) {
    cam.sub(look).multiplyScalar(clamped / radius).add(look);
  }
}
