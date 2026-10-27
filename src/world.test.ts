import {describe,it,expect} from 'vitest';
import {heightAt,mulberry32,chunkCoord,scrapSpawns,CHUNK_SIZE} from './world';
describe('streaming world generation',()=>{
  it('generates deterministic terrain heights',()=>expect(heightAt(12,-7)).toBe(heightAt(12,-7)));
  it('keeps elevations finite across positive and negative chunks',()=>{
    for(let x=-96;x<=96;x+=8)for(let z=-96;z<=96;z+=8)
      expect(Number.isFinite(heightAt(x,z))).toBe(true);
  });
  it('repeats seeded random sequences',()=>{
    const a=mulberry32(123),b=mulberry32(123);
    expect([a(),a(),a()]).toEqual([b(),b(),b()]);
  });
  it('correctly handles negative chunk boundaries',()=>{
    expect(chunkCoord(0)).toBe(0);
    expect(chunkCoord(CHUNK_SIZE-.1)).toBe(0);
    expect(chunkCoord(CHUNK_SIZE)).toBe(1);
    expect(chunkCoord(-.1)).toBe(-1);
    expect(chunkCoord(-CHUNK_SIZE)).toBe(-1);
  });
  it('uses stable resource ids regardless of traversal order',()=>{
    expect(scrapSpawns(2,-3)).toEqual(scrapSpawns(2,-3));
    expect(scrapSpawns(2,-3).map(p=>p.id)).not.toEqual(scrapSpawns(3,-3).map(p=>p.id));
  });
  it('provides accessible starter metal and copper for first construction',()=>{
    const starter=scrapSpawns(0,0);
    expect(starter.some(item=>item.resource==='metal'&&Math.hypot(item.x,item.z)<2.7)).toBe(true);
    expect(starter.some(item=>item.resource==='copper'&&Math.hypot(item.x,item.z)<2.7)).toBe(true);
  });
});
