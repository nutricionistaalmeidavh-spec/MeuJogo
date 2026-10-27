import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import {heightAt,chunkCoord,type Obstacle} from './world';
import {type GameState,type VehicleSave} from './game-state';
import {partMesh} from './build-view';
import {vehicleMass} from './vehicle-state';
import {wheelSpring,motorForce,steerStrength,energyUsed,wheelGrip} from './vehicle-dynamics';

const STEP=1/60;
const WHEEL_RADIUS=.52;
const REST_LENGTH=.71;
const FRONT_Z=1.5,REAR_Z=-1.5;
const HALF_TRACK=1.03;
const WHEELS=[
  {x:-HALF_TRACK,z:FRONT_Z},
  {x:HALF_TRACK,z:FRONT_Z},
  {x:-HALF_TRACK,z:REAR_Z},
  {x:HALF_TRACK,z:REAR_Z}
];
const clamp=(v:number,min:number,max:number)=>Math.max(min,Math.min(max,v));
export interface DriveInput {throttle:number;steer:number;brake:boolean}
export interface Contact {x:number;y:number;z:number;compression:number;grounded:boolean}
export class VehicleRig {
  readonly group=new THREE.Group();
  readonly physics:RAPIER.World;
  readonly body:RAPIER.RigidBody;
  readonly groundColliders:RAPIER.Collider[]=[];
  readonly wheelMeshes=new Map<string,THREE.Mesh>();
  readonly partMeshes=new Map<string,THREE.Mesh>();
  readonly contacts:Contact[]=[];
  private key='';
  private elapsed=0;
  private accumulator=0;
  private visualMeshes:THREE.Mesh[]=[];
  private basePositions=new Map<string,THREE.Vector3>();
  private bodyMass:number;
  private data:VehicleSave;
  private currentSpeed=0;
  private input:DriveInput={throttle:0,steer:0,brake:true};
  private driver=false;
  private frameHealth=100;
  constructor(
    private scene:THREE.Scene,
    state:GameState
  ){
    if(!state.vehicle)throw Error('Veículo não montado');
    this.data={...state.vehicle,partIds:[...state.vehicle.partIds],detachedWheelIds:[...state.vehicle.detachedWheelIds]};
    this.physics=new RAPIER.World({x:0,y:-9.81,z:0});
    this.physics.timestep=STEP;
    this.bodyMass=vehicleMass(state);
    this.body=this.physics.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(this.data.x,this.data.y+.35,this.data.z)
        .setRotation({x:0,y:Math.sin(this.data.yaw/2),z:0,w:Math.cos(this.data.yaw/2)})
        .setLinearDamping(.3)
        .setAngularDamping(2.5)
        .setCcdEnabled(true)
    );
    this.physics.createCollider(
      RAPIER.ColliderDesc.cuboid(.78,.23,1.43).setFriction(.85).setRestitution(.08).setMass(this.bodyMass),
      this.body
    );
    this.group.name='buggy-sucata';
    const {originX,originY,originZ}=this.data;
    for(const piece of state.parts.filter(p=>this.data.partIds.includes(p.id))){
      const mesh=partMesh(piece);
      mesh.position.set(piece.x-originX,piece.y-originY-.35,piece.z-originZ);
      this.basePositions.set(piece.id,mesh.position.clone());
      this.visualMeshes.push(mesh);
      this.partMeshes.set(piece.id,mesh);
      if(piece.kind==='wheel')this.wheelMeshes.set(piece.id,mesh);
      this.group.add(mesh);
    }
    const hood=new THREE.Mesh(new THREE.BoxGeometry(.88,.16,.78),new THREE.MeshStandardMaterial({color:0xc4864d,metalness:.7,roughness:.4}));
    hood.position.set(0,-.12,.83);hood.castShadow=true;this.group.add(hood);this.visualMeshes.push(hood);
    this.scene.add(this.group);
    this.applyWheelVisibility();
    this.syncTransform();
  }
  get x(){return this.body.translation().x;}
  get y(){return this.body.translation().y;}
  get z(){return this.body.translation().z;}
  get kmh(){return Math.round(Math.abs(this.currentSpeed)*3.6);}
  get health(){return this.data.health;}
  get charge(){return this.data.charge;}
  get wheels(){return this.wheelMeshes.size-this.data.detachedWheelIds.length;}
  get isDriving(){return this.driver;}
  get canDrive(){return this.wheels>=3&&this.data.health>0&&this.data.charge>0;}
  setDriver(enabled:boolean){this.driver=enabled;this.input={throttle:0,steer:0,brake:!enabled};}
  setInput(input:DriveInput){this.input=input;}
  updateData(saved:VehicleSave){
    this.data={...saved,partIds:[...saved.partIds],detachedWheelIds:[...saved.detachedWheelIds]};
    this.frameHealth=this.data.health;
    this.applyWheelVisibility();
  }
  private applyWheelVisibility(){
    for(const [id,mesh] of this.wheelMeshes)mesh.visible=!this.data.detachedWheelIds.includes(id);
  }
  private syncTransform(){
    const p=this.body.translation(),q=this.body.rotation();
    this.group.position.set(p.x,p.y,p.z);
    this.group.quaternion.set(q.x,q.y,q.z,q.w);
  }
  /** Cache collider meshes around the active region; never accumulate stale terrain. */
  refreshTerrain(terrains:THREE.Mesh[],obstacles:Obstacle[]){
    const region=chunkCoord(this.x)+':'+chunkCoord(this.z);
    if(this.key===region)return;
    this.key=region;
    for(const collider of this.groundColliders)this.physics.removeCollider(collider,true);
    this.groundColliders.length=0;
    for(const terrain of terrains){
      const dx=terrain.position.x-this.x,dz=terrain.position.z-this.z;
      if(Math.hypot(dx,dz)>70)continue;
      const attr=terrain.geometry.attributes.position;
      const verts=new Float32Array(attr.count*3);
      for(let i=0;i<attr.count;i++){
        verts[i*3]=attr.getX(i)+terrain.position.x;
        verts[i*3+1]=attr.getY(i)+terrain.position.y;
        verts[i*3+2]=attr.getZ(i)+terrain.position.z;
      }
      const idx=terrain.geometry.getIndex();
      if(!idx)continue;
      const indices=Uint32Array.from(idx.array);
      this.groundColliders.push(this.physics.createCollider(
        RAPIER.ColliderDesc.trimesh(verts,indices).setFriction(1.1)
      ));
    }
    for(const obstacle of obstacles){
      if(Math.hypot(obstacle.x-this.x,obstacle.z-this.z)>56)continue;
      this.groundColliders.push(this.physics.createCollider(
        RAPIER.ColliderDesc.ball(obstacle.radius).setTranslation(obstacle.x,obstacle.y,obstacle.z).setFriction(.9)
      ));
    }
  }
  stepFrame(dt:number){
    if(!Number.isFinite(dt)||dt<=0)return;
    this.accumulator=Math.min(.15,this.accumulator+Math.min(dt,.06));
    let iterations=0;
    while(this.accumulator>=STEP&&iterations<5){
      this.fixedStep(STEP);
      this.accumulator-=STEP;iterations++;
    }
    this.syncTransform();
    if(this.y<-30||Math.abs(this.x)>10000||Math.abs(this.z)>10000)this.reset();
  }
  private fixedStep(dt:number){
    const input=this.driver?this.input:{throttle:0,steer:0,brake:true};
    const position=this.body.translation(),rotation=this.body.rotation(),vel=this.body.linvel(),angvel=this.body.angvel();
    const quat=new THREE.Quaternion(rotation.x,rotation.y,rotation.z,rotation.w);
    const forward=new THREE.Vector3(0,0,1).applyQuaternion(quat);
    const lateral=new THREE.Vector3(1,0,0).applyQuaternion(quat);
    this.currentSpeed=vel.x*forward.x+vel.z*forward.z;
    let grounded=0;
    const detached=new Set(this.data.detachedWheelIds);
    const wheelIds=[...this.wheelMeshes.keys()];
    this.contacts.length=0;
    for(let i=0;i<4;i++){
      const offset=WHEELS[i];
      const worldOffset=new THREE.Vector3(offset.x,-.17,offset.z).applyQuaternion(quat);
      const anchor=new THREE.Vector3(position.x+worldOffset.x,position.y+worldOffset.y,position.z+worldOffset.z);
      const surface=heightAt(anchor.x,anchor.z);
      const gap=anchor.y-surface-WHEEL_RADIUS;
      const compression=clamp(REST_LENGTH-gap,0,REST_LENGTH);
      const velocityAtWheel=new THREE.Vector3(vel.x,vel.y,vel.z)
        .add(new THREE.Vector3(angvel.x,angvel.y,angvel.z).cross(worldOffset));
      const active=!detached.has(wheelIds[i]);
      const spring=active?wheelSpring(compression,velocityAtWheel.y):0;
      const contact={x:anchor.x,y:surface+WHEEL_RADIUS,z:anchor.z,compression,grounded:spring>0};
      this.contacts.push(contact);
      if(!spring)continue;
      grounded++;
      this.body.addForceAtPoint({x:0,y:spring,z:0},anchor,true);
      const tractionScale=wheelGrip(this.wheels);
      const lateralVelocity=velocityAtWheel.dot(lateral);
      const sideForce=clamp(-lateralVelocity*this.bodyMass*2.2,-spring*.9,spring*.9)*tractionScale;
      this.body.addForceAtPoint(
        {x:lateral.x*sideForce,y:0,z:lateral.z*sideForce},anchor,true
      );
      if(input.brake){
        const resist=clamp(-velocityAtWheel.dot(forward)*this.bodyMass*1.4,-spring*.9,spring*.9);
        this.body.addForceAtPoint({x:forward.x*resist,y:0,z:forward.z*resist},anchor,true);
      }else if(i>=2){
        const drive=motorForce(input.throttle,this.currentSpeed,this.data.charge,this.data.health)*tractionScale*.5;
        this.body.addForceAtPoint({x:forward.x*drive,y:0,z:forward.z*drive},anchor,true);
      }
    }
    if(grounded>0){
      const steering=input.steer*steerStrength(this.currentSpeed)*this.bodyMass*3.2*clamp(this.currentSpeed/5,-1,1);
      this.body.addTorque({x:0,y:steering,z:0},true);
      const drag=-this.currentSpeed*Math.abs(this.currentSpeed)*.8;
      this.body.addForce({x:forward.x*drag,y:0,z:forward.z*drag},true);
    }
    if(this.driver&&this.data.charge>0&&grounded>0){
      this.data.charge=Math.max(0,this.data.charge-energyUsed(input.throttle,dt));
    }
    this.data.distance+=Math.abs(this.currentSpeed)*dt;
    this.physics.step();
    for(const [index,mesh] of [...this.wheelMeshes.values()].entries()){
      const base=this.basePositions.get([...this.wheelMeshes.keys()][index]);
      if(!base)continue;
      mesh.position.y=base.y+((this.contacts[index]?.compression??0)-.1)*.6;
      mesh.rotation.x+=this.currentSpeed*dt/WHEEL_RADIUS;
      if(index<2)mesh.rotation.y=(index<2?input.steer*.28:0);
    }
  }
  capture():VehicleSave {
    const p=this.body.translation(),q=this.body.rotation();
    const yaw=Math.atan2(2*(q.w*q.y+q.x*q.z),1-2*(q.y*q.y+q.z*q.z));
    return {...this.data,x:p.x,y:p.y-.35,z:p.z,yaw,
      partIds:[...this.data.partIds],detachedWheelIds:[...this.data.detachedWheelIds]};
  }
  reset(){
    const p=this.body.translation(),surface=heightAt(p.x,p.z);
    this.body.setTranslation({x:p.x,y:surface+2.1,z:p.z},true);
    this.body.setRotation({x:0,y:Math.sin(this.data.yaw/2),z:0,w:Math.cos(this.data.yaw/2)},true);
    this.body.setLinvel({x:0,y:0,z:0},true);
    this.body.setAngvel({x:0,y:0,z:0},true);
  }
  dispose(){
    for(const collider of this.groundColliders)this.physics.removeCollider(collider,true);
    this.physics.removeRigidBody(this.body);
    this.physics.free();
    this.scene.remove(this.group);
    for(const mesh of this.visualMeshes){
      mesh.geometry.dispose();
      if(![...this.partMeshes.values()].includes(mesh))(mesh.material as THREE.Material).dispose();
    }
  }
}
