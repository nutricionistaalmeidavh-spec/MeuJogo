import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import {ChunkWorld,heightAt,chunkCoord} from './world';
import {BuildView,partHeight} from './build-view';
import {loadGame,saveGame} from './storage';
import {
  PARTS,initialState,restoreState,collectScrap,craftPart,removePart,movePart,rotatePart,
  resizePart,weldParts,makeBlueprint,installBlueprint,snapPosition,partCost,
  type GameState,type PartKind,type Part,type Position,type Result
} from './game-state';
import './style.css';

const app=document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML=[
  '<div id="hud">',
  '<header id="topbar"><div class="panel brand"><h1>MEUJOGO <span>ALPHA 0.2</span></h1><small>Exploração e engenharia</small></div>',
  '<div class="panel stats"><div>Metal <b id="metal">0</b> · Cobre <b id="copper">0</b></div><small id="status">Carregando mundo...</small></div></header>',
  '<div id="hint" class="panel">Encontre sucata e comece sua oficina.</div>',
  '<section id="builder" class="panel" hidden aria-label="Oficina de construção">',
  '<div class="builder-title"><div><h2>Oficina</h2><small>Toque no chão para construir</small></div><button id="close-build" aria-label="Fechar construção">✕</button></div>',
  '<div class="tool-bar" role="group" aria-label="Ferramentas">',
  '<button id="tool-place" data-tool="place">Colocar</button><button id="tool-select" data-tool="select">Selecionar</button>',
  '<button id="tool-move" data-tool="move">Mover</button><button id="tool-weld" data-tool="weld">Soldar</button></div>',
  '<div id="part-catalog" class="catalog" role="group" aria-label="Peças"></div>',
  '<div id="selected-details" class="selected-details">Escolha uma peça do catálogo e toque no terreno.</div>',
  '<div class="tool-bar tool-actions"><button id="rotate">↻ Girar</button><button id="raise">↑ Subir</button>',
  '<button id="lower">↓ Descer</button><button id="shrink">− Cortar</button><button id="grow">+ Alongar</button>',
  '<button id="dismantle">Desmontar</button></div>',
  '<div class="tool-bar tool-secondary"><button id="undo">↶ Desfazer</button><button id="redo">↷ Refazer</button>',
  '<button id="export">Exportar projeto</button><button id="import">Importar projeto</button>',
  '<input id="blueprint-file" type="file" accept=".json,application/json" hidden></div>',
  '<small class="build-help">Peças custam recursos. Soldas ligam peças próximas. Projetos importados também consomem materiais.</small>',
  '</section>',
  '<div id="joystick" aria-label="Mover personagem" role="application"><div id="stick"></div></div>',
  '<div id="actions"><button id="collect" title="Coletar sucata próxima">Coletar <span id="collect-near">· E</span></button>',
  '<button id="toggle-build">Construir · B</button><button id="camera">Girar câmera</button>',
  '<button id="zoom">Zoom</button><button id="save">Salvar</button></div>',
  '<div id="message" role="status" aria-live="polite"></div>',
  '</div>'
].join('');
const get=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
renderer.setSize(innerWidth,innerHeight);
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.domElement.id='game-canvas';
renderer.domElement.setAttribute('aria-label','Mundo 3D do MeuJogo');
app.prepend(renderer.domElement);
const scene=new THREE.Scene();
scene.background=new THREE.Color(0xa9c9c1);
scene.fog=new THREE.FogExp2(0xa9c9c1,.007);
scene.add(new THREE.HemisphereLight(0xe5ffed,0x63726d,1.7));
const sunlight=new THREE.DirectionalLight(0xffeac7,2.4);
sunlight.position.set(35,60,30);sunlight.castShadow=true;
sunlight.shadow.mapSize.set(1024,1024);
sunlight.shadow.camera.left=-38;sunlight.shadow.camera.right=38;
sunlight.shadow.camera.top=38;sunlight.shadow.camera.bottom=-38;
scene.add(sunlight);
const camera=new THREE.OrthographicCamera(-13,13,13,-13,.1,400);
const world=new ChunkWorld(scene);
const buildView=new BuildView(scene);
const player=new THREE.Group();
const body=new THREE.Mesh(new THREE.CapsuleGeometry(.36,.86,5,10),new THREE.MeshStandardMaterial({color:0xf1b45b,roughness:.65}));
body.position.y=1.05;body.castShadow=true;player.add(body);
const face=new THREE.Mesh(new THREE.BoxGeometry(.24,.15,.1),new THREE.MeshStandardMaterial({color:0x324a48}));
face.position.set(0,1.3,.36);player.add(face);scene.add(player);
const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();
const keys=new Set<string>(),joystick={x:0,y:0};
let state:GameState=initialState();
let mode:'explore'|'build'='explore',tool:'place'|'select'|'move'|'weld'='place';
let chosen:PartKind='connector',selection:string|null=null,weldStart:string|null=null;
let candidate:Position|null=null,rotation=0,lift=0,zoom=13,cameraAngle=Math.PI/4;
let history:GameState[]=[],future:GameState[]=[];
let saveTimer:ReturnType<typeof setTimeout>|undefined;
let saveInFlight=false,saveAgain=false,loaded=false,clock=0,last=0,messageUntil=0,lastHintAt=0;
const partButtons=(Object.keys(PARTS) as PartKind[]).map(kind=>{
  const item=PARTS[kind],cost=partCost(kind);
  return '<button type="button" class="part-button" data-kind="'+kind+'"><span>'+item.label+'</span><small>'+cost.metal+' metal'+(cost.copper?' · '+cost.copper+' cobre':'')+'</small></button>';
}).join('');
get('part-catalog').innerHTML=partButtons;
function say(text:string){
  get('message').textContent=text;
  get('message').classList.add('show');
  messageUntil=performance.now()+3000;
}
function canAfford(kind:PartKind,length=PARTS[kind].length){
  const cost=partCost(kind,length);
  return state.inventory.metal>=cost.metal&&state.inventory.copper>=cost.copper;
}
function updateHud(){
  get('metal').textContent=String(state.inventory.metal);
  get('copper').textContent=String(state.inventory.copper);
  const close=world.closestScrap(player.position.x,player.position.z);
  get('collect-near').textContent=close?'· +1 '+(close.resource==='metal'?'metal':'cobre'):'· E';
  const coords='Região '+chunkCoord(player.position.x)+','+chunkCoord(player.position.z);
  get('status').textContent=(mode==='build'?'Construindo':'Explorando')+' · '+coords;
  for(const button of Array.from(get('part-catalog').querySelectorAll<HTMLButtonElement>('[data-kind]'))){
    const kind=button.dataset.kind as PartKind;
    button.classList.toggle('active',kind===chosen);
    button.classList.toggle('unaffordable',!canAfford(kind));
  }
  for(const name of ['place','select','move','weld']){
    const button=get('tool-'+name);
    button.classList.toggle('active',tool===name);
    button.setAttribute('aria-pressed',String(tool===name));
  }
  const selected=state.parts.find(p=>p.id===selection);
  if(selected){
    const name=PARTS[selected.kind].label;
    get('selected-details').textContent=name+' · '+selected.length.toFixed(1)+' m · '+selected.rotation+'°'+
      ' · '+state.welds.filter(w=>w.a===selected.id||w.b===selected.id).length+' solda(s)';
  }else{
    get('selected-details').textContent=tool==='weld'?(weldStart?'Agora toque na segunda peça':'Toque em duas peças próximas'):
      tool==='move'?'Selecione uma peça, depois toque onde deseja movê-la':
      tool==='select'?'Toque em uma peça existente para editar':
      'Escolhido: '+PARTS[chosen].label+' · toque no chão para colocar';
  }
  const canEdit=!!selected;
  for(const id of ['dismantle','shrink','grow'])get<HTMLButtonElement>(id).disabled=!canEdit;
  get<HTMLButtonElement>('undo').disabled=history.length===0;
  get<HTMLButtonElement>('redo').disabled=future.length===0;
}
function renderBuild(){
  buildView.render(state,selection);
  updateHud();
}
function remember(before:GameState){
  history.push(before);if(history.length>40)history.shift();
  future=[];
}
function commit(next:GameState,recordHistory=true){
  if(next===state)return;
  if(recordHistory)remember(state);
  state=next;renderBuild();queueSave();
}
function accept(result:Result){
  if(!result.ok){say(result.error||'Não foi possível realizar a operação');return false;}
  commit(result.state);return true;
}
function queueSave(){
  if(!loaded)return;
  clearTimeout(saveTimer);
  saveTimer=setTimeout(()=>{void persist();},750);
}
function snapshot():GameState{
  return {...state,player:{x:player.position.x,z:player.position.z},savedAt:Date.now()};
}
async function persist(){
  if(!loaded)return;
  if(saveInFlight){saveAgain=true;return;}
  saveInFlight=true;
  do {
    saveAgain=false;
    try {await saveGame(snapshot());}
    catch(error){console.error('Erro ao salvar',error);say('Falha no salvamento local');}
  }while(saveAgain);
  saveInFlight=false;
}
function doCollect(){
  const item=world.closestScrap(player.position.x,player.position.z);
  if(!item){say('Aproxime-se da sucata para coletar');return;}
  const next=collectScrap(state,item.id,item.resource);
  if(next===state)return;
  state=next;world.collect(item.id);
  updateHud();queueSave();
  say('+1 '+(item.resource==='metal'?'metal':'cobre')+' no inventário');
}
function setMode(next:'explore'|'build'){
  mode=next;document.body.classList.toggle('build-mode',mode==='build');
  get('builder').hidden=mode!=='build';
  get('toggle-build').textContent=mode==='build'?'Explorar · B':'Construir · B';
  if(mode==='explore'){buildView.hidePreview();weldStart=null;}
  if(mode==='build'){tool='place';say('Escolha uma peça e toque no terreno');}
  updateHud();
}
function setTool(next:typeof tool){
  tool=next;weldStart=null;
  if(tool!=='place'&&tool!=='move')buildView.hidePreview();
  updateHud();
}
function selectedPart():Part|undefined{return state.parts.find(p=>p.id===selection);}
function adjustRotation(){
  if(selection&&tool!=='place'&&tool!=='move')commit(rotatePart(state,selection));
  else {rotation=(rotation+90)%360;updatePreview();}
}
function updatePreview(){
  if(mode!=='build'||!candidate||tool!=='place'&&tool!=='move'){buildView.hidePreview();return;}
  const selected=selectedPart();
  const kind=tool==='move'&&selected?selected.kind:chosen;
  const length=tool==='move'&&selected?selected.length:PARTS[kind].length;
  const turn=tool==='move'&&selected?selected.rotation:rotation;
  const allowed=Math.hypot(candidate.x-player.position.x,candidate.z-player.position.z)<=16&&
    (tool==='move'||canAfford(kind,length));
  buildView.preview(kind,candidate,turn,length,allowed);
}
function rayAt(e:PointerEvent){
  const rect=renderer.domElement.getBoundingClientRect();
  pointer.x=((e.clientX-rect.left)/rect.width)*2-1;
  pointer.y=-((e.clientY-rect.top)/rect.height)*2+1;
  raycaster.setFromCamera(pointer,camera);
}
function positionAt(e:PointerEvent):Position|null {
  rayAt(e);
  const hit=raycaster.intersectObjects(world.terrainMeshes(),false)[0];
  if(!hit)return null;
  const x=Math.round(hit.point.x*2)/2,z=Math.round(hit.point.z*2)/2;
  const part=tool==='move'?selectedPart():undefined;
  const kind=part?.kind||chosen;
  const height=partHeight(kind)/2;
  let candidateY=Math.round((heightAt(x,z)+height+lift)*2)/2;
  if(candidateY<heightAt(x,z)+height-.3)candidateY=Math.ceil((heightAt(x,z)+height)*2)/2;
  return snapPosition({x,y:candidateY,z});
}
function chooseExisting(e:PointerEvent):string|null{
  rayAt(e);return buildView.pick(raycaster);
}
function onGround(e:PointerEvent){
  if(mode!=='build')return;
  if(tool==='select'){
    selection=chooseExisting(e);renderBuild();return;
  }
  if(tool==='weld'){
    const id=chooseExisting(e);
    if(!id){say('Toque na superfície de uma peça');return;}
    if(!weldStart){weldStart=id;selection=id;renderBuild();say('Agora selecione a segunda peça');return;}
    if(accept(weldParts(state,weldStart,id))){selection=id;say('Solda realizada');}
    weldStart=null;renderBuild();return;
  }
  if(tool==='move'&&!selection){
    selection=chooseExisting(e);renderBuild();
    if(selection)say('Agora toque no terreno para mover a peça');return;
  }
  const point=positionAt(e);
  if(!point){say('Toque no terreno visível');return;}
  if(Math.hypot(point.x-player.position.x,point.z-player.position.z)>16){say('A oficina alcança até 16 m do jogador');return;}
  candidate=point;
  if(tool==='move'){
    if(!selection)return;
    commit(movePart(state,selection,point));
    say('Peça reposicionada');updatePreview();return;
  }
  const id='part-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8);
  if(accept(craftPart(state,chosen,point,id,rotation))){selection=id;say(PARTS[chosen].label+' instalada');}
  updatePreview();
}
let pointerDown:{x:number;y:number;pointerId:number}|null=null;
renderer.domElement.addEventListener('pointerdown',e=>{
  if(mode!=='build')return;
  pointerDown={x:e.clientX,y:e.clientY,pointerId:e.pointerId};
});
renderer.domElement.addEventListener('pointermove',e=>{
  if(mode!=='build'||(tool!=='place'&&tool!=='move'))return;
  candidate=positionAt(e);updatePreview();
});
renderer.domElement.addEventListener('pointerup',e=>{
  if(!pointerDown||pointerDown.pointerId!==e.pointerId)return;
  const moved=Math.hypot(pointerDown.x-e.clientX,pointerDown.y-e.clientY);
  pointerDown=null;
  if(moved<36)onGround(e);
});
renderer.domElement.addEventListener('pointercancel',()=>pointerDown=null);

const stick=get('stick'),pad=get('joystick');
function updateStick(e:PointerEvent){
  const rect=pad.getBoundingClientRect();
  const x=e.clientX-(rect.left+rect.width/2),y=e.clientY-(rect.top+rect.height/2);
  const distance=Math.hypot(x,y),factor=distance?Math.min(1,distance/42)/distance:0;
  joystick.x=x*factor;joystick.y=y*factor;
  stick.style.transform='translate('+joystick.x*40+'px,'+joystick.y*40+'px)';
}
pad.addEventListener('pointerdown',e=>{pad.setPointerCapture(e.pointerId);updateStick(e);});
pad.addEventListener('pointermove',e=>{if(pad.hasPointerCapture(e.pointerId))updateStick(e);});
function resetStick(){joystick.x=0;joystick.y=0;stick.style.transform='';}
pad.addEventListener('pointerup',resetStick);pad.addEventListener('pointercancel',resetStick);
addEventListener('keydown',e=>{
  if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key))e.preventDefault();
  if(e.ctrlKey||e.metaKey){
    if(e.key.toLowerCase()==='z'){e.preventDefault();undo();return;}
    if(e.key.toLowerCase()==='y'){e.preventDefault();redo();return;}
  }
  const key=e.key.toLowerCase();keys.add(key);
  if(key==='b')setMode(mode==='build'?'explore':'build');
  if(key==='e'&&mode==='explore')doCollect();
  if(key==='r'&&mode==='build')adjustRotation();
  if(key==='escape'&&mode==='build')setMode('explore');
  if(key==='delete'&&mode==='build')dismantle();
  if(mode==='build'&&key>='1'&&key<='7'){
    chosen=(Object.keys(PARTS) as PartKind[])[Number(key)-1];setTool('place');
  }
});
addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));
get('collect').addEventListener('click',doCollect);
get('toggle-build').addEventListener('click',()=>setMode(mode==='build'?'explore':'build'));
get('close-build').addEventListener('click',()=>setMode('explore'));
get('camera').addEventListener('click',()=>{cameraAngle+=Math.PI/4;});
get('zoom').addEventListener('click',()=>{zoom=zoom>=22?10:zoom+3;resize();});
get('save').addEventListener('click',()=>{void persist().then(()=>say('Salvamento local solicitado'));});
for(const name of ['place','select','move','weld'] as const)
  get('tool-'+name).addEventListener('click',()=>setTool(name));
get('part-catalog').addEventListener('click',e=>{
  const button=(e.target as Element).closest<HTMLButtonElement>('[data-kind]');
  if(!button)return;
  chosen=button.dataset.kind as PartKind;rotation=0;lift=0;selection=null;setTool('place');renderBuild();updatePreview();
});
get('rotate').addEventListener('click',adjustRotation);
get('raise').addEventListener('click',()=>{lift+=.5;if(candidate){candidate.y+=.5;updatePreview();}});
get('lower').addEventListener('click',()=>{lift=Math.max(0,lift-.5);if(candidate){candidate.y=Math.max(Math.ceil((heightAt(candidate.x,candidate.z)+partHeight(chosen)/2)*2)/2,candidate.y-.5);updatePreview();}});
get('grow').addEventListener('click',()=>resizeSelected(.5));
get('shrink').addEventListener('click',()=>resizeSelected(-.5));
function resizeSelected(delta:number){
  const part=selectedPart();if(!part){say('Selecione uma peça');return;}
  if(accept(resizePart(state,part.id,part.length+delta)))say('Comprimento atualizado');
}
function dismantle(){
  if(!selection)return;
  const next=removePart(state,selection);
  if(next===state)return;
  commit(next);selection=null;renderBuild();say('Peça desmontada · parte do material recuperado');
}
get('dismantle').addEventListener('click',dismantle);
function undo(){
  const old=history.pop();if(!old)return;
  future.push(state);state=old;selection=null;renderBuild();queueSave();say('Ação desfeita');
}
function redo(){
  const next=future.pop();if(!next)return;
  history.push(state);state=next;selection=null;renderBuild();queueSave();say('Ação refeita');
}
get('undo').addEventListener('click',undo);
get('redo').addEventListener('click',redo);
get('export').addEventListener('click',()=>{
  const blueprint=makeBlueprint(state);
  if(!blueprint.parts.length){say('Construa uma peça antes de exportar');return;}
  const blob=new Blob([JSON.stringify(blueprint,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob),link=document.createElement('a');
  link.href=url;link.download='meujogo-projeto.json';document.body.append(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),5000);say('Projeto exportado');
});
get('import').addEventListener('click',()=>get<HTMLInputElement>('blueprint-file').click());
get<HTMLInputElement>('blueprint-file').addEventListener('change',async e=>{
  const input=e.currentTarget as HTMLInputElement,file=input.files?.[0];input.value='';
  if(!file)return;
  if(file.size>150000){say('Projeto grande demais (máximo 150 KB)');return;}
  try{
    const data:unknown=JSON.parse(await file.text());
    const origin=snapPosition({x:player.position.x+3,y:heightAt(player.position.x+3,player.position.z),z:player.position.z});
    const result=installBlueprint(state,data,origin);
    if(accept(result))say('Projeto importado e materiais consumidos');
  }catch{say('Arquivo JSON inválido');}
});
function resize(){
  const aspect=innerWidth/innerHeight;
  camera.left=-zoom*aspect;camera.right=zoom*aspect;
  camera.top=zoom;camera.bottom=-zoom;camera.updateProjectionMatrix();
  renderer.setSize(innerWidth,innerHeight);
}
addEventListener('resize',resize);resize();
let physics:RAPIER.World;
async function init(){
  await RAPIER.init();
  physics=new RAPIER.World({x:0,y:-9.81,z:0});
  const previous=await loadGame().catch(()=>null);
  state=restoreState(previous);
  player.position.set(state.player.x,heightAt(state.player.x,state.player.z),state.player.z);
  world.update(player.position.x,player.position.z,state.collected);
  renderBuild();loaded=true;
  say(previous?'Mundo recuperado · abra a Oficina para construir':'Colete sucata e construa sua primeira peça');
  requestAnimationFrame(frame);
}
function frame(time:number){
  requestAnimationFrame(frame);
  const dt=Math.min((time-last)/1000||0,.05);last=time;clock+=dt;
  if(mode==='explore'){
    let dx=joystick.x+(keys.has('d')||keys.has('arrowright')?1:0)-(keys.has('a')||keys.has('arrowleft')?1:0);
    let dz=joystick.y+(keys.has('s')||keys.has('arrowdown')?1:0)-(keys.has('w')||keys.has('arrowup')?1:0);
    const len=Math.hypot(dx,dz);
    if(len>.05){
      dx/=Math.max(1,len);dz/=Math.max(1,len);
      const mx=(dx*Math.cos(cameraAngle)+dz*Math.sin(cameraAngle))*dt*5;
      const mz=(-dx*Math.sin(cameraAngle)+dz*Math.cos(cameraAngle))*dt*5;
      player.position.x=Math.max(-10000,Math.min(10000,player.position.x+mx));
      player.position.z=Math.max(-10000,Math.min(10000,player.position.z+mz));
      player.rotation.y=Math.atan2(mx,mz);
      if(world.update(player.position.x,player.position.z,state.collected))updateHud();
    }
  }
  player.position.y=heightAt(player.position.x,player.position.z);
  const offset=new THREE.Vector3(Math.sin(cameraAngle)*zoom,zoom*.97,Math.cos(cameraAngle)*zoom);
  const target=player.position.clone().add(offset);
  camera.position.lerp(target,Math.min(1,dt*6));
  camera.lookAt(player.position.x,player.position.y+.5,player.position.z);
  sunlight.position.set(player.position.x+35,player.position.y+60,player.position.z+30);
  const day=Math.sin(clock/120*Math.PI*2);
  sunlight.intensity=1.7+Math.max(.15,day)*.75;
  const haze=new THREE.Color(0xabc8c0).lerp(new THREE.Color(0x566c7a),Math.max(0,-day)*.65);
  scene.background=haze;
  if(scene.fog instanceof THREE.FogExp2)scene.fog.color.copy(haze);
  if(mode==='explore'&&time-lastHintAt>600){
    const close=world.closestScrap(player.position.x,player.position.z);
    get('hint').textContent=close?'Sucata próxima: toque em Coletar ou pressione E':
      'Explore com WASD ou joystick; abra Construir para usar materiais';
    updateHud();lastHintAt=time;
  }
  if(messageUntil&&time>messageUntil){get('message').classList.remove('show');messageUntil=0;}
  renderer.render(scene,camera);
}
document.addEventListener('visibilitychange',()=>{if(document.hidden)void persist();});
addEventListener('pagehide',()=>{void persist();});
void init().catch(error=>{
  console.error('Falha ao iniciar MeuJogo',error);
  get('status').textContent='Erro ao iniciar';
  say('Não foi possível iniciar o mundo 3D');
});
