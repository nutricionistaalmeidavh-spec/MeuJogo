import {describe,it,expect} from 'vitest';
import {snapToAssembly,type Part} from './game-state';
const beam:Part={id:'a',kind:'beam',x:0,y:.5,z:0,rotation:0,length:2};
describe('snap joints',()=>{
 it('aligns the end of a new beam with an existing beam',()=>{
   const result=snapToAssembly({x:2.1,y:.5,z:.12},'beam',2,0,[beam]);
   expect(result.position).toEqual({x:2,y:.5,z:0});
   expect(result.connectTo).toBe('a');
 });
 it('keeps ordinary grid snapping far from other parts',()=>{
   const result=snapToAssembly({x:8.2,y:.5,z:0},'beam',2,0,[beam]);
   expect(result.position).toEqual({x:8,y:.5,z:0});
   expect(result.connectTo).toBeNull();
 });
 it('supports rotated structure axes',()=>{
   const other:Part={...beam,rotation:90};
   const result=snapToAssembly({x:0,y:.5,z:2.1},'beam',2,90,[other]);
   expect(result.position).toEqual({x:0,y:.5,z:2});
   expect(result.connectTo).toBe('a');
 });
});
