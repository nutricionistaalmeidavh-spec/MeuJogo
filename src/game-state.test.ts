import {describe,it,expect} from 'vitest';
import {
  initialState,restoreState,collectScrap,craftPart,removePart,
  movePart,resizePart,weldParts,snapPosition,makeBlueprint,installBlueprint,partCost
} from './game-state';

describe('exploration, resources and persistence',()=>{
  it('creates a new world with empty inventory and builds',()=>{
    expect(initialState().inventory).toEqual({metal:0,copper:0});
    expect(initialState().parts).toEqual([]);
  });
  it('migrates old phase 1 saves without losing the scrap',()=>{
    const world=restoreState({x:4,z:-3,inventory:5,collected:['scrap-2'],savedAt:123});
    expect(world.inventory).toEqual({metal:5,copper:0});
    expect(world.player).toEqual({x:4,z:-3});
    expect(world.collected).toEqual(['scrap-2']);
  });
  it('collects deterministic resources only once',()=>{
    const first=collectScrap(initialState(),'0:0:metal-0','metal');
    const second=collectScrap(first,'0:0:metal-0','metal');
    expect(first.inventory.metal).toBe(1);
    expect(second).toEqual(first);
    expect(collectScrap(first,'0:0:copper-0','copper').inventory.copper).toBe(1);
  });
});

describe('hybrid construction',()=>{
  it('snaps placement to a 0.5m grid',()=>{
    expect(snapPosition({x:1.26,y:0.74,z:-2.26})).toEqual({x:1.5,y:0.5,z:-2.5});
  });
  it('does not allow crafting without materials',()=>{
    const result=craftPart(initialState(),'beam',{x:0,y:1,z:0},'piece-1');
    expect(result.ok).toBe(false);
    expect(result.state.parts).toHaveLength(0);
  });
  it('uses material from inventory to build a configurable beam',()=>{
    const state=initialState();state.inventory.metal=8;
    const result=craftPart(state,'beam',{x:1.2,y:0.5,z:0},'piece-1');
    expect(result.ok).toBe(true);
    expect(result.state.inventory.metal).toBe(8-partCost('beam',2).metal);
    expect(result.state.parts[0]).toMatchObject({id:'piece-1',kind:'beam',x:1,y:0.5,z:0,length:2});
    expect(state.parts).toHaveLength(0);
  });
  it('moves a part and charges material when length is increased',()=>{
    const state=initialState();state.inventory.metal=12;
    const added=craftPart(state,'beam',{x:1,y:0,z:0},'beam-1').state;
    const moved=movePart(added,'beam-1',{x:2.24,y:0,z:3.1});
    expect(moved.parts[0]).toMatchObject({x:2,y:0,z:3});
    const stretched=resizePart(moved,'beam-1',4);
    expect(stretched.ok).toBe(true);
    expect(stretched.state.parts[0].length).toBe(4);
    expect(stretched.state.inventory.metal).toBe(moved.inventory.metal-(partCost('beam',4).metal-partCost('beam',2).metal));
  });
  it('connects nearby pieces once and removes welds with dismantled pieces',()=>{
    const state=initialState();state.inventory.metal=15;
    const first=craftPart(state,'connector',{x:0,y:0,z:0},'a').state;
    const second=craftPart(first,'connector',{x:1,y:0,z:0},'b').state;
    const welded=weldParts(second,'a','b');
    expect(welded.ok).toBe(true);
    expect(welded.state.welds).toEqual([{a:'a',b:'b'}]);
    expect(weldParts(welded.state,'a','b').ok).toBe(false);
    const removed=removePart(welded.state,'a');
    expect(removed.parts).toHaveLength(1);
    expect(removed.welds).toEqual([]);
  });
  it('exports designs but installing them still consumes materials',()=>{
    const state=initialState();state.inventory.metal=10;
    const prepared=craftPart(state,'connector',{x:0,y:0,z:0},'a').state;
    const bp=makeBlueprint(prepared);
    expect(bp.parts).toHaveLength(1);
    expect(installBlueprint(initialState(),bp,{x:5,y:0,z:5}).ok).toBe(false);
    const richer=initialState();richer.inventory.metal=5;
    const result=installBlueprint(richer,bp,{x:5,y:0,z:5});
    expect(result.ok).toBe(true);
    expect(result.state.parts[0].x).toBe(5);
  });
  it('rejects malformed blueprints',()=>{
    const invalid={version:1,parts:[{id:'bad',kind:'constructor',x:0,y:0,z:0,length:2,rotation:0}],welds:[]};
    expect(installBlueprint(initialState(),invalid,{x:0,y:0,z:0}).ok).toBe(false);
  });
});
