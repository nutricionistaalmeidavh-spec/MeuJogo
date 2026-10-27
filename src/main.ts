import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import {createWorld,heightAt,mulberry32,WORLD_SIZE} from './world';
import {loadGame,saveGame,type SaveData} from './storage';
import './style.css';

const app=document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML=`<div id="hud"><header><div class="panel"><h1>MEUJOGO <small>ALPHA 0.1</small></h1><small>Oficina de sucata · Mundo 01</small></div><div class="panel stats">Sucata: <b id="count">0</b><br><small id="status">Carregando...</small></div></header><div id="joystick"><div id="stick"></div></div><div id="actions"><button id="collect">Coletar</button><button id="save">Salvar mundo</button><button id="camera">Girar câmera</button><button id="zoom">Zoom −</button></div><div id="message"></div></div>`;
const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
renderer.setSize(innerWidth,innerHeight);
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.outputColorSpace=THREE.SRGBColorSpace;
app.prepend(renderer.domElement);
const scene=new THREE.Scene();scene.background=new THREE.Color(0xa9c9c1);scene.fog=new THREE.FogExp2(0xa9c9c1,.012);
scene.add(new THREE.HemisphereLight(0xf4fff1,0x596f6d,2));
const sun=new THREE.DirectionalLight(0xffebc1,2.3);sun.position.set(14,28,8);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);sun.shadow.camera.left=-30;sun.shadow.camera.right=30;sun.shadow.camera.top=30;sun.shadow.camera.bottom=-30;scene.add(sun);
const camera=new THREE.OrthographicCamera(-12,12,12, -12,.1,250);
const {ground}=createWorld(scene);
const player=new THREE.Group();
const body=new THREE.Mesh(new THREE.CapsuleGeometry(.36,.85,5,10),new THREE.MeshStandardMaterial({color:0xf1b45b}));
body.position.y=1.03;body.castShadow=true;player.add(body);
const face=new THREE.Mesh(new THREE.BoxGeometry(.22,.16,.08),new THREE.MeshStandardMaterial({color:0x304943}));
face.position.set(0,1.26,.34);player.add(face);scene.add(player);
const scraps=new Map<string,THREE.Group>(),collected=new Set<string>();
const rng=mulberry32(2244),metal=new THREE.MeshStandardMaterial({color:0xa6b6ba,metalness:.7,roughness:.35}),copper=new THREE.MeshStandardMaterial({color:0xb56b3d,metalness:.5,roughness:.5});
for(let i=0;i<45;i++){
 const x=(rng()-.5)*(WORLD_SIZE-12),z=(rng()-.5)*(WORLD_SIZE-12),id='scrap-'+i;
 const group=new THREE.Group();
 const item=new THREE.Mesh(i%2?new THREE.CylinderGeometry(.3,.3,.24,8):new THREE.BoxGeometry(.55,.23,.45),i%3?metal:copper);
 item.rotation.y=rng()*Math.PI;item.castShadow=true;group.add(item);
 group.position.set(x,heightAt(x,z)+.35,z);group.userData.id=id;
 scene.add(group);scraps.set(id,group);
}
let inventory=0,angle=Math.PI/4,zoom=13,savePending=false;
const keys=new Set<string>(),joystick={x:0,y:0};
const stick=document.querySelector<HTMLElement>('#stick')!,pad=document.querySelector<HTMLElement>('#joystick')!;
function updateStick(e:PointerEvent){const r=pad.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2,dx=e.clientX-cx,dy=e.clientY-cy,mag=Math.max(1,Math.hypot(dx,dy)/42);joystick.x=dx/mag/42;joystick.y=dy/mag/42;stick.style.transform=`translate(${joystick.x*40}px,${joystick.y*40}px)`;}
pad.addEventListener('pointerdown',e=>{pad.setPointerCapture(e.pointerId);updateStick(e);});
pad.addEventListener('pointermove',e=>{if(pad.hasPointerCapture(e.pointerId))updateStick(e);});
function resetStick(){joystick.x=0;joystick.y=0;stick.style.transform='';}
pad.addEventListener('pointerup',resetStick);pad.addEventListener('pointercancel',resetStick);
addEventListener('keydown',e=>{if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key))e.preventDefault();keys.add(e.key.toLowerCase());if(e.key.toLowerCase()==='e')collect();});
addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));
const message=document.querySelector<HTMLElement>('#message')!;
let messageUntil=0;
function notify(text:string){message.textContent=text;message.classList.add('show');messageUntil=performance.now()+2200;}
function collect(){
 let closest:THREE.Group|null=null,distance=2.3;
 for(const scrap of scraps.values()){const d=Math.hypot(scrap.position.x-player.position.x,scrap.position.z-player.position.z);if(d<distance){distance=d;closest=scrap;}}
 if(!closest){notify('Aproxime-se de uma peça de sucata');return;}
 const id=closest.userData.id as string;collected.add(id);scraps.delete(id);scene.remove(closest);inventory++;document.querySelector('#count')!.textContent=String(inventory);notify('+1 sucata recuperada');void persist();
}
function snapshot():SaveData{return {x:player.position.x,z:player.position.z,inventory,collected:[...collected],savedAt:Date.now()};}
async function persist(){if(savePending)return;savePending=true;try{await saveGame(snapshot());document.querySelector('#status')!.textContent='Mundo salvo';}catch{document.querySelector('#status')!.textContent='Falha ao salvar';}finally{savePending=false;}}
document.querySelector('#collect')!.addEventListener('click',collect);
document.querySelector('#save')!.addEventListener('click',()=>{void persist().then(()=>notify('Salvamento solicitado'));});
document.querySelector('#camera')!.addEventListener('click',()=>angle+=Math.PI/4);
document.querySelector('#zoom')!.addEventListener('click',()=>{zoom=zoom>=22?10:zoom+3;resize();});
function resize(){const aspect=innerWidth/innerHeight;camera.left=-zoom*aspect;camera.right=zoom*aspect;camera.top=zoom;camera.bottom=-zoom;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);}
addEventListener('resize',resize);resize();
let world:RAPIER.World;
async function init(){
 await RAPIER.init();
 world=new RAPIER.World({x:0,y:-9.81,z:0});
 const floor=world.createRigidBody(RAPIER.RigidBodyDesc.fixed());world.createCollider(RAPIER.ColliderDesc.cuboid(WORLD_SIZE/2,.1,WORLD_SIZE/2),floor);
 const saved=await loadGame().catch(()=>null);
 if(saved){player.position.set(saved.x,0,saved.z);inventory=saved.inventory;for(const id of saved.collected){collected.add(id);const s=scraps.get(id);if(s){scene.remove(s);scraps.delete(id);}}}
 document.querySelector('#count')!.textContent=String(inventory);document.querySelector('#status')!.textContent='Explorando · WASD / toque';
 notify(saved?'Mundo restaurado':'Explore e recolha sucata');
 requestAnimationFrame(frame);
}
let last=0,elapsed=0;
function frame(time:number){
 requestAnimationFrame(frame);
 const dt=Math.min((time-last)/1000||0,.05);last=time;elapsed+=dt;
 let ix=joystick.x+(keys.has('d')||keys.has('arrowright')?1:0)-(keys.has('a')||keys.has('arrowleft')?1:0);
 let iz=joystick.y+(keys.has('s')||keys.has('arrowdown')?1:0)-(keys.has('w')||keys.has('arrowup')?1:0);
 const len=Math.hypot(ix,iz);
 if(len>.05){ix/=Math.max(1,len);iz/=Math.max(1,len);
 const dx=(ix*Math.cos(angle)+iz*Math.sin(angle))*dt*5;
 const dz=(-ix*Math.sin(angle)+iz*Math.cos(angle))*dt*5;
 player.position.x=THREE.MathUtils.clamp(player.position.x+dx,-WORLD_SIZE/2+2,WORLD_SIZE/2-2);
 player.position.z=THREE.MathUtils.clamp(player.position.z+dz,-WORLD_SIZE/2+2,WORLD_SIZE/2-2);
 player.rotation.y=Math.atan2(dx,dz);
 }
 player.position.y=heightAt(player.position.x,player.position.z);
 const target=player.position.clone();const offset=new THREE.Vector3(Math.sin(angle)*zoom,zoom*.95,Math.cos(angle)*zoom);
 camera.position.lerp(target.add(offset),Math.min(1,dt*5));camera.lookAt(player.position.x,player.position.y+.6,player.position.z);
 if(elapsed>45){elapsed=0;void persist();}
 if(messageUntil&&time>messageUntil){message.classList.remove('show');messageUntil=0;}
 renderer.render(scene,camera);
}
document.addEventListener('visibilitychange',()=>{if(document.hidden)void persist();});
window.addEventListener('pagehide',()=>{void persist();});
void init().catch(err=>{console.error(err);document.querySelector('#status')!.textContent='Erro ao iniciar';notify('Não foi possível iniciar o motor físico');});
