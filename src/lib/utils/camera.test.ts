import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { clampCamToDollyRange } from './camera';

/**
 * Pins the fix for the Expand-All camera lock: when a focus target's camera
 * point lands OUTSIDE OrbitControls' [minDistance, maxDistance] dolly range,
 * controls.update() clamps the camera away from it every frame, the rig's
 * arrival check never passes, and the forever-animating rig overrides all user
 * pan/zoom input. The helper must pull the fly-to point inside the range.
 */
describe('clampCamToDollyRange', () => {
  it('pulls a camera point beyond maxDistance onto the max sphere, preserving direction', () => {
    const look = new THREE.Vector3(10, -5, 0);
    // Reproduce the real lock: distance 280 + 0.2·280 vertical offset → radius ≈ 285.5 > max 280
    const cam = new THREE.Vector3(10, -5 + 56, 280);
    clampCamToDollyRange(cam, look, 3, 274);
    expect(cam.distanceTo(look)).toBeCloseTo(274, 6);
    // Direction from look must be unchanged
    const dir = cam.clone().sub(look).normalize();
    expect(dir.x).toBeCloseTo(0, 6);
    expect(dir.y).toBeCloseTo(56 / Math.hypot(56, 280), 6);
    expect(dir.z).toBeCloseTo(280 / Math.hypot(56, 280), 6);
  });

  it('pushes a camera point inside minDistance out onto the min sphere', () => {
    const look = new THREE.Vector3(0, 0, 0);
    const cam = new THREE.Vector3(0, 0.2, 1);
    clampCamToDollyRange(cam, look, 3, 280);
    expect(cam.distanceTo(look)).toBeCloseTo(3, 6);
  });

  it('leaves a camera point already inside the range untouched', () => {
    const look = new THREE.Vector3(5, 5, 0);
    const cam = new THREE.Vector3(5, 7, 10);
    const before = cam.clone();
    clampCamToDollyRange(cam, look, 3, 280);
    expect(cam.equals(before)).toBe(true);
  });

  it('re-clamping with a smaller max pulls an already-clamped point further in (mid-flight breakpoint flip)', () => {
    const look = new THREE.Vector3(0, 0, 0);
    const cam = new THREE.Vector3(0, 56, 280);
    clampCamToDollyRange(cam, look, 3, 274.4); // compact max sphere
    clampCamToDollyRange(cam, look, 3, 68.6); // desktop max after compact→desktop flip
    expect(cam.distanceTo(look)).toBeCloseTo(68.6, 6);
  });

  it('is a no-op when camera and look-at coincide (zero radius)', () => {
    const look = new THREE.Vector3(1, 2, 3);
    const cam = look.clone();
    clampCamToDollyRange(cam, look, 3, 280);
    expect(cam.equals(look)).toBe(true);
  });
});
