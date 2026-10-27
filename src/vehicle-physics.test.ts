import {describe,it,expect} from 'vitest';
import {wheelSpring,motorForce,steerStrength,energyUsed,wheelGrip} from './vehicle-dynamics';
describe('vehicle dynamics: stable deterministic control forces',()=>{
 it('wheel suspension pushes upwards on compressed wheels and damps oscillations',()=>{
  expect(wheelSpring(.35,0)).toBeGreaterThan(0);
  expect(wheelSpring(-.05,0)).toBe(0);
  expect(wheelSpring(.35,2)).toBeLessThan(wheelSpring(.35,0));
  expect(wheelSpring(.35,-2)).toBeGreaterThan(wheelSpring(.35,0));
 });
 it('engine does not propel a depleted or destroyed car',()=>{
  expect(motorForce(1,0,100,100)).toBeGreaterThan(0);
  expect(motorForce(1,0,0,100)).toBe(0);
  expect(motorForce(1,0,100,0)).toBe(0);
 });
 it('limits high-speed propulsion and permits reverse at low speed',()=>{
  expect(motorForce(1,40,100,100)).toBe(0);
  expect(motorForce(-1,0,100,100)).toBeLessThan(0);
 });
 it('steers only when rolling and slows steering at high speed',()=>{
  expect(steerStrength(0)).toBe(0);
  expect(steerStrength(6)).toBeGreaterThan(0);
  expect(steerStrength(28)).toBeLessThan(steerStrength(6));
 });
 it('returns zero traction for lost wheels and consumes charge with motor effort',()=>{
  expect(wheelGrip(0)).toBe(0);
  expect(wheelGrip(4)).toBeGreaterThan(wheelGrip(2));
  expect(energyUsed(0,0)).toBe(0);
  expect(energyUsed(1,1)).toBeGreaterThan(0);
 });
});
