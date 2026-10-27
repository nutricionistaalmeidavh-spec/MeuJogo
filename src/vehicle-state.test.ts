import {describe,it,expect} from 'vitest';
import {initialState,craftPart,restoreState,makeBlueprint} from './game-state';
import {
  CAR_KIT_COST,claimStarterCache,buildBuggy,assembleVehicle,disassembleVehicle,
  repairVehicle,rechargeVehicle,applyCrashDamage,vehicleMass,validateAssembly
} from './vehicle-state';
const enriched=()=>{
  const s=initialState();
  s.inventory.metal=40;s.inventory.copper=15;return s;
};
describe('phase 3: built vehicles',()=>{
  it('offers a one-time salvaged workshop kit without resource duplication',()=>{
    const start=initialState();const once=claimStarterCache(start);
    expect(once.inventory.metal).toBe(CAR_KIT_COST.metal);
    expect(once.inventory.copper).toBe(CAR_KIT_COST.copper);
    expect(claimStarterCache(once)).toEqual(once);
  });
  it('requires materials and never partially consumes on failed construction',()=>{
    const s=initialState();
    const result=buildBuggy(s,{x:3,y:2,z:0});
    expect(result.ok).toBe(false);
    expect(result.state).toEqual(s);
  });
  it('builds a drivable buggy using existing modular parts and welds',()=>{
    const s=enriched();
    const built=buildBuggy(s,{x:3,y:2,z:0});
    expect(built.ok).toBe(true);
    expect(built.state.parts.filter(p=>p.kind==='wheel')).toHaveLength(4);
    expect(built.state.parts.filter(p=>p.kind==='motor')).toHaveLength(1);
    expect(built.state.parts.filter(p=>p.kind==='battery')).toHaveLength(1);
    expect(built.state.vehicle?.partIds.length).toBe(8);
    expect(built.state.welds.length).toBeGreaterThanOrEqual(7);
    expect(built.state.inventory.metal).toBe(s.inventory.metal-CAR_KIT_COST.metal);
    expect(built.state.inventory.copper).toBe(s.inventory.copper-CAR_KIT_COST.copper);
    expect(s.vehicle).toBeNull();
    expect(vehicleMass(built.state)).toBeGreaterThan(60);
    expect(makeBlueprint(built.state).parts).toHaveLength(8);
  });
  it('does not fabricate a second car while one is active',()=>{
    const s=buildBuggy(enriched(),{x:0,y:2,z:0}).state;
    expect(buildBuggy(s,{x:5,y:2,z:0}).ok).toBe(false);
  });
  it('recognizes incomplete assemblies and requires welded drivetrain',()=>{
    const s=enriched();
    const chassis=craftPart(s,'beam',{x:0,y:1,z:0},'frame').state;
    const validation=validateAssembly(chassis,chassis.parts.map(p=>p.id));
    expect(validation.ok).toBe(false);
    expect(assembleVehicle(chassis,{x:0,y:1,z:0}).ok).toBe(false);
  });
  it('keeps vehicle and damage when loading saves, without discarding old parts',()=>{
    const saved=buildBuggy(enriched(),{x:2,y:2,z:0}).state;
    const damaged=applyCrashDamage(saved,65,18).state;
    const loaded=restoreState(JSON.parse(JSON.stringify(damaged)));
    expect(loaded.vehicle?.health).toBeLessThan(100);
    expect(loaded.vehicle?.partIds).toHaveLength(8);
    expect(loaded.parts).toHaveLength(8);
    expect(restoreState({version:2,parts:saved.parts,welds:saved.welds}).vehicle).toBeNull();
  });
  it('high-speed collision harms components, and repairs spend materials',()=>{
    const s=buildBuggy(enriched(),{x:2,y:2,z:0}).state;
    const hit=applyCrashDamage(s,55,27);
    expect(hit.state.vehicle?.health).toBeLessThan(100);
    expect(hit.state.vehicle?.detachedWheelIds.length).toBeGreaterThan(0);
    const repaired=repairVehicle(hit.state);
    expect(repaired.ok).toBe(true);
    expect(repaired.state.vehicle?.health).toBeGreaterThan(hit.state.vehicle!.health);
    expect(repaired.state.vehicle?.detachedWheelIds.length).toBe(0);
    expect(repaired.state.inventory.metal).toBeLessThan(hit.state.inventory.metal);
  });
  it('fuel drains and copper recharges without exceeding capacity',()=>{
    const state=buildBuggy(enriched(),{x:2,y:2,z:0}).state;
    state.vehicle!.charge=8;
    const result=rechargeVehicle(state);
    expect(result.ok).toBe(true);
    expect(result.state.vehicle?.charge).toBeGreaterThan(8);
    expect(result.state.vehicle!.charge).toBeLessThanOrEqual(100);
    expect(result.state.inventory.copper).toBeLessThan(state.inventory.copper);
  });
  it('disassembles in place, leaving recoverable original pieces',()=>{
    const state=buildBuggy(enriched(),{x:3,y:2,z:0}).state;
    state.vehicle!.x=12;state.vehicle!.z=-6;state.vehicle!.yaw=0.5;
    const result=disassembleVehicle(state);
    expect(result.vehicle).toBeNull();
    expect(result.parts).toHaveLength(8);
    expect(result.parts.some(p=>Math.abs(p.x-12)<4&&Math.abs(p.z+6)<4)).toBe(true);
  });
});
