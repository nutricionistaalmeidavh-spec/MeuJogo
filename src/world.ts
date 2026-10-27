import * as THREE from 'three';
export const WORLD_SIZE=96;
export function heightAt(x:number,z:number):number {
  return Math.sin(x*.09)*1.15+Math.cos(z*.11)*.9+Math.sin((x+z)*.055)*.65;
}
export function createWorld(scene:THREE.Scene) {
 const geometry=new THREE.PlaneGeometry(WORLD_SIZE,WORLD_SIZE,96,96);
 geometry.rotateX(-Math.PI/2);
 const pos=geometry.attributes.position;
 for(let i=0;i<pos.count;i++){const x=pos.getX(i),z=pos.getZ(i);pos.setY(i,heightAt(x,z));}
 geometry.computeVertexNormals();
 const ground=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:0x68876b,roughness:1,flatShading:true}));
 ground.receiveShadow=true;scene.add(ground);
 const grid=new THREE.GridHelper(WORLD_SIZE,48,0x42594d,0x526f58);grid.position.y=.06;grid.visible=false;scene.add(grid);
 const treeMat=new THREE.MeshStandardMaterial({color:0x3e7350,flatShading:true});
 const trunkMat=new THREE.MeshStandardMaterial({color:0x76533d});
 const rockMat=new THREE.MeshStandardMaterial({color:0x858e89,flatShading:true});
 const rng=mulberry32(83042);
 for(let i=0;i<95;i++){
   const x=(rng()-.5)*(WORLD_SIZE-8),z=(rng()-.5)*(WORLD_SIZE-8);
   if(Math.hypot(x,z)<9)continue;
   const y=heightAt(x,z);
   if(i%3===0){
     const trunk=new THREE.Mesh(new THREE.CylinderGeometry(.15,.24,1.35,6),trunkMat);trunk.position.set(x,y+.67,z);scene.add(trunk);
     const crown=new THREE.Mesh(new THREE.ConeGeometry(.85+rng()*.5,2.4,7),treeMat);crown.position.set(x,y+2.5,z);crown.castShadow=true;scene.add(crown);
   }else{
     const rock=new THREE.Mesh(new THREE.DodecahedronGeometry(.4+rng()*.5,0),rockMat);rock.position.set(x,y+.2,z);rock.scale.set(1,.6,1);scene.add(rock);
   }
 }
 return {ground,grid};
}
export function mulberry32(seed:number){return ()=>{let t=seed+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;};}
