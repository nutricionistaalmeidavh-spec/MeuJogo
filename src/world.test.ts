import {describe,it,expect} from 'vitest';
import {heightAt,mulberry32} from './world';
describe('world generation',()=>{
 it('is deterministic for the same coordinates',()=>expect(heightAt(12,-7)).toBe(heightAt(12,-7)));
 it('returns finite elevations across world bounds',()=>{for(let x=-48;x<=48;x+=4)for(let z=-48;z<=48;z+=4)expect(Number.isFinite(heightAt(x,z))).toBe(true);});
 it('repeats seeded random sequences',()=>{const a=mulberry32(123),b=mulberry32(123);expect([a(),a(),a()]).toEqual([b(),b(),b()]);});
});
