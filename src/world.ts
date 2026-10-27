import * as THREE from 'three';
import type {Resource} from './game-state';

export const CHUNK_SIZE=32;
export const WORLD_SIZE=512;
const RADIUS=2;
const SEGMENTS=16;
export function heightAt(x:number,z:number):number {
  return Math.sin(x*.09)*1.15+Math.cos(z*.11)*.9+Math.sin((x+z)*.055)*.65+
    Math.sin(x*.025+z*.014)*1.5;
}
export function mulberry32(seed:number){
  return ()=>{let t=seed+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);
    t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;};
}
export const chunkCoord=(x:number)=>Math.floor(x/CHUNK_SIZE);
export const chunkKey=(cx:number,cz:number)=>cx+':'+cz;
function seedFor(cx:number,cz:number){
  return (Math.imul(cx+14321,374761393)^Math.imul(cz-319,668265263))>>>0;
}
export interface ScrapSpawn {id:string;resource:Resource;x:number;z:number}
export function scrapSpawns(cx:number,cz:number):ScrapSpawn[] {
  const random=mulberry32(seedFor(cx,cz)^0x5ac4b3e1);
  const spawns:ScrapSpawn[]=[];
  for(let index=0;index<9;index++){
    const x=cx*CHUNK_SIZE+2+random()*(CHUNK_SIZE-4);
    const z=cz*CHUNK_SIZE+2+random()*(CHUNK_SIZE-4);
    spawns.push({id:chunkKey(cx,cz)+':scrap-'+index,resource:index%4===0?'copper':'metal',x,z});
  }
  if(cx===0&&cz===0){
    spawns[0]={id:'0:0:scrap-0',resource:'metal',x:1.1,z:1.1};
    spawns[1]={id:'0:0:scrap-1',resource:'metal',x:2,z:1.5};
    spawns[2]={id:'0:0:scrap-2',resource:'copper',x:1.5,z:2.2};
    spawns[3]={id:'0:0:scrap-3',resource:'metal',x:3,z:2.4};
  }
  return spawns;
}
type Chunk={group:THREE.Group;terrain:THREE.Mesh;scrapIds:string[]};
export interface ScrapObject {id:string;resource:Resource;mesh:THREE.Mesh;position:THREE.Vector3}
const groundMat=new THREE.MeshStandardMaterial({color:0x68876b,flatShading:true,roughness:1});
const dirtMat=new THREE.MeshStandardMaterial({color:0x8c8762,flatShading:true,roughness:1});
const trunkMat=new THREE.MeshStandardMaterial({color:0x76533d});
const crownMat=new THREE.MeshStandardMaterial({color:0x376b4d,flatShading:true});
const rockMat=new THREE.MeshStandardMaterial({color:0x848f90,flatShading:true});
const metalMat=new THREE.MeshStandardMaterial({color:0xa9b6c2,metalness:.7,roughness:.35});
const copperMat=new THREE.MeshStandardMaterial({color:0xd48e54,metalness:.65,roughness:.35});
const trunkGeo=new THREE.CylinderGeometry(.13,.22,1.15,6);
const crownGeo=new THREE.ConeGeometry(.78,2.1,7);
const rockGeo=new THREE.DodecahedronGeometry(.56,0);
const scrapGeo=new THREE.DodecahedronGeometry(.37,0);
export class ChunkWorld {
  private chunks=new Map<string,Chunk>();
  readonly scraps=new Map<string,ScrapObject>();
  private center='';
  constructor(private scene:THREE.Scene){}
  update(x:number,z:number,collected:readonly string[]){
    const cx=chunkCoord(x),cz=chunkCoord(z),key=chunkKey(cx,cz);
    if(this.center===key)return false;
    this.center=key;
    const wanted=new Set<string>();
    const collectedIds=new Set(collected);
    for(let dx=-RADIUS;dx<=RADIUS;dx++)for(let dz=-RADIUS;dz<=RADIUS;dz++){
      const px=cx+dx,pz=cz+dz,id=chunkKey(px,pz);wanted.add(id);
      if(!this.chunks.has(id))this.load(px,pz,collectedIds);
    }
    for(const [id,chunk] of this.chunks)if(!wanted.has(id)){
      this.scene.remove(chunk.group);
      chunk.terrain.geometry.dispose();
      chunk.scrapIds.forEach(scrapId=>this.scraps.delete(scrapId));
      this.chunks.delete(id);
    }
    return true;
  }
  private load(cx:number,cz:number,collected:Set<string>){
    const key=chunkKey(cx,cz),x0=cx*CHUNK_SIZE,z0=cz*CHUNK_SIZE;
    const centerX=x0+CHUNK_SIZE/2,centerZ=z0+CHUNK_SIZE/2;
    const group=new THREE.Group(),geo=new THREE.PlaneGeometry(CHUNK_SIZE,CHUNK_SIZE,SEGMENTS,SEGMENTS);
    geo.rotateX(-Math.PI/2);
    const positions=geo.attributes.position;
    for(let i=0;i<positions.count;i++){
      const lx=positions.getX(i),lz=positions.getZ(i);
      positions.setY(i,heightAt(centerX+lx,centerZ+lz));
    }
    positions.needsUpdate=true;geo.computeVertexNormals();
    const terrain=new THREE.Mesh(geo,Math.sin(cx*.7+cz*.4)>0.6?dirtMat:groundMat);
    terrain.position.set(centerX,0,centerZ);terrain.receiveShadow=true;group.add(terrain);
    const random=mulberry32(seedFor(cx,cz));
    for(let i=0;i<12;i++){
      const x=x0+2+random()*(CHUNK_SIZE-4),z=z0+2+random()*(CHUNK_SIZE-4);
      if(Math.hypot(x,z)<8)continue;
      const y=heightAt(x,z);
      if(i%3===0){
        const trunk=new THREE.Mesh(trunkGeo,trunkMat);trunk.position.set(x,y+.57,z);group.add(trunk);
        const crown=new THREE.Mesh(crownGeo,crownMat);
        crown.position.set(x,y+2.15,z);crown.castShadow=true;group.add(crown);
      }else{
        const rock=new THREE.Mesh(rockGeo,rockMat);
        rock.position.set(x,y+.17,z);rock.scale.set(1,.5,1);group.add(rock);
      }
    }
    const scrapIds:string[]=[];
    for(const item of scrapSpawns(cx,cz)){
      if(collected.has(item.id))continue;
      const mesh=new THREE.Mesh(scrapGeo,item.resource==='copper'?copperMat:metalMat);
      mesh.position.set(item.x,heightAt(item.x,item.z)+.5,item.z);
      mesh.rotation.set(.2,random()*Math.PI,.1);mesh.castShadow=true;
      group.add(mesh);
      scrapIds.push(item.id);
      this.scraps.set(item.id,{...item,mesh,position:mesh.position});
    }
    this.scene.add(group);this.chunks.set(key,{group,terrain,scrapIds});
  }
  collect(id:string){
    const item=this.scraps.get(id);if(!item)return;
    item.mesh.removeFromParent();this.scraps.delete(id);
    for(const chunk of this.chunks.values()){
      const index=chunk.scrapIds.indexOf(id);
      if(index!==-1){chunk.scrapIds.splice(index,1);break;}
    }
  }
  closestScrap(x:number,z:number,range=2.7):ScrapObject|null {
    let closest:ScrapObject|null=null,minimum=range;
    for(const item of this.scraps.values()){
      const d=Math.hypot(item.position.x-x,item.position.z-z);
      if(d<minimum){closest=item;minimum=d;}
    }
    return closest;
  }
  terrainMeshes():THREE.Mesh[]{return [...this.chunks.values()].map(c=>c.terrain);}
  get loadedChunkCount(){return this.chunks.size;}
  clear(){
    for(const c of this.chunks.values()){this.scene.remove(c.group);c.terrain.geometry.dispose();}
    this.chunks.clear();this.scraps.clear();this.center='';
  }
}
