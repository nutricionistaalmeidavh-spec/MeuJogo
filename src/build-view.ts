import * as THREE from 'three';
import {PARTS,type GameState,type Part,type PartKind,type Position} from './game-state';

export function partHeight(kind:PartKind):number{
  if(kind==='wheel')return 1.25;
  if(kind==='motor')return .9;
  if(kind==='battery')return .8;
  if(kind==='plate')return .26;
  if(kind==='pipe')return .4;
  return .5;
}
function geometry(kind:PartKind,length:number):THREE.BufferGeometry{
  switch(kind){
    case 'beam':return new THREE.BoxGeometry(length,.38,.38);
    case 'plate':return new THREE.BoxGeometry(length,.22,2);
    case 'wheel':{
      const geo=new THREE.CylinderGeometry(.62,.62,.38,20);
      geo.rotateZ(Math.PI/2);return geo;
    }
    case 'motor':return new THREE.BoxGeometry(1.05,.86,.9);
    case 'battery':return new THREE.BoxGeometry(1,.75,.75);
    case 'pipe':{
      const geo=new THREE.CylinderGeometry(.17,.17,length,12);
      geo.rotateZ(Math.PI/2);return geo;
    }
    default:return new THREE.BoxGeometry(.5,.5,.5);
  }
}
const materials=new Map<PartKind,THREE.MeshStandardMaterial>();
function material(kind:PartKind){
  let value=materials.get(kind);
  if(!value){
    value=new THREE.MeshStandardMaterial({color:PARTS[kind].color,metalness:.45,roughness:.45});
    materials.set(kind,value);
  }
  return value;
}
function partMesh(part:Part):THREE.Mesh{
  const mesh=new THREE.Mesh(geometry(part.kind,part.length),material(part.kind));
  mesh.position.set(part.x,part.y,part.z);
  mesh.rotation.y=THREE.MathUtils.degToRad(part.rotation);
  mesh.castShadow=true;mesh.receiveShadow=true;
  mesh.userData.partId=part.id;
  return mesh;
}
export class BuildView{
  readonly meshes=new Map<string,THREE.Mesh>();
  private links:THREE.Line[]=[];
  private ghost:THREE.Mesh|null=null;
  private selected:THREE.BoxHelper|null=null;
  constructor(private scene:THREE.Scene){}
  render(state:GameState,selection:string|null){
    for(const mesh of this.meshes.values()){
      mesh.removeFromParent();mesh.geometry.dispose();
    }
    this.meshes.clear();
    for(const line of this.links){
      line.removeFromParent();line.geometry.dispose();
    }
    this.links=[];
    this.selected?.removeFromParent();this.selected=null;
    for(const part of state.parts){
      const mesh=partMesh(part);this.scene.add(mesh);this.meshes.set(part.id,mesh);
    }
    for(const weld of state.welds){
      const a=this.meshes.get(weld.a),b=this.meshes.get(weld.b);
      if(!a||!b)continue;
      const line=new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([a.position,b.position]),
        new THREE.LineBasicMaterial({color:0xe5b85e})
      );
      this.scene.add(line);this.links.push(line);
    }
    if(selection&&this.meshes.has(selection)){
      this.selected=new THREE.BoxHelper(this.meshes.get(selection)!,0xffeb8a);
      this.scene.add(this.selected);
    }
  }
  pick(raycaster:THREE.Raycaster):string|null{
    const hits=raycaster.intersectObjects([...this.meshes.values()],false);
    return hits.length?String(hits[0].object.userData.partId):null;
  }
  preview(kind:PartKind,position:Position,rotation=0,length=PARTS[kind].length,valid=true){
    const previous=this.ghost;
    if(previous){previous.removeFromParent();previous.geometry.dispose();(previous.material as THREE.Material).dispose();}
    const mat=new THREE.MeshStandardMaterial({
      color:valid?0x86efac:0xf87171,transparent:true,opacity:.52,
      depthWrite:false,metalness:.25,roughness:.5
    });
    const mesh=new THREE.Mesh(geometry(kind,length),mat);
    mesh.position.set(position.x,position.y,position.z);
    mesh.rotation.y=THREE.MathUtils.degToRad(rotation);
    this.ghost=mesh;
    this.scene.add(mesh);
  }
  hidePreview(){
    if(!this.ghost)return;
    this.ghost.removeFromParent();this.ghost.geometry.dispose();
    (this.ghost.material as THREE.Material).dispose();this.ghost=null;
  }
  clear(){this.hidePreview();this.render({version:2,player:{x:0,z:0},inventory:{metal:0,copper:0},collected:[],parts:[],welds:[],savedAt:0},null);}
}
