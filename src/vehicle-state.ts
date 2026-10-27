import {
  PARTS,craftPart,partCost,weldParts,initialState,snapPosition,
  type GameState,type Part,type PartKind,type Position,type Result,type Inventory
} from './game-state';

const CHASSIS_PARTS:ReadonlyArray<{kind:PartKind;dx:number;dy:number;dz:number;length?:number;rotation?:number}>= [
  {kind:'beam',dx:0,dy:1.1,dz:0,length:3,rotation:90},
  {kind:'plate',dx:0,dy:1.2,dz:0,rotation:90},
  {kind:'wheel',dx:-1,dy:.5,dz:1.5},
  {kind:'wheel',dx:1,dy:.5,dz:1.5},
  {kind:'wheel',dx:-1,dy:.5,dz:-1.5},
  {kind:'wheel',dx:1,dy:.5,dz:-1.5},
  {kind:'motor',dx:0,dy:1.1,dz:.65},
  {kind:'battery',dx:0,dy:1.1,dz:-.65}
];
export const CAR_KIT_COST:Inventory=CHASSIS_PARTS.reduce((total,item)=>{
  const cost=partCost(item.kind,item.length??PARTS[item.kind].length);
  total.metal+=cost.metal;total.copper+=cost.copper;
  return total;
},{metal:0,copper:0});
const massByKind:Record<PartKind,number>={
  beam:16,plate:15,wheel:9,motor:28,battery:13,pipe:7,connector:4
};
const copy=(s:GameState):GameState=>({
  ...s,player:{...s.player},inventory:{...s.inventory},collected:[...s.collected],
  parts:s.parts.map(p=>({...p})),welds:s.welds.map(w=>({...w})),
  vehicle:s.vehicle?{...s.vehicle,partIds:[...s.vehicle.partIds],
    detachedWheelIds:[...s.vehicle.detachedWheelIds]}:null
});
const failure=(state:GameState,error:string):Result=>({ok:false,state,error});
export function vehicleMass(state:GameState):number{
  if(!state.vehicle)return 0;
  const members=state.parts.filter(p=>state.vehicle!.partIds.includes(p.id));
  return Math.min(500,Math.max(90,30+members.reduce((sum,p)=>sum+massByKind[p.kind]*(p.length/PARTS[p.kind].length),0)));
}
export function validateAssembly(state:GameState,partIds:string[]):{ok:boolean;error?:string}{
  const parts=state.parts.filter(p=>partIds.includes(p.id));
  const count=(kind:PartKind)=>parts.filter(p=>p.kind===kind).length;
  if(!count('beam')&&!count('plate'))return {ok:false,error:'Falta viga ou chapa para o chassi'};
  if(count('wheel')<4)return {ok:false,error:'São necessárias quatro rodas'};
  if(!count('motor'))return {ok:false,error:'Falta motor'};
  if(!count('battery'))return {ok:false,error:'Falta bateria'};
  if(parts.length>48)return {ok:false,error:'Montagem excede 48 componentes'};
  if(parts.some(p=>Math.abs(p.y-parts[0].y)>4))return {ok:false,error:'Peças em alturas incompatíveis'};
  return {ok:true};
}
function connectedComponent(state:GameState,anchor:string):string[]{
  const known=new Set([anchor]),pending=[anchor];
  while(pending.length){
    const current=pending.pop()!;
    for(const weld of state.welds){
      const other=weld.a===current?weld.b:weld.b===current?weld.a:null;
      if(other&&!known.has(other)){known.add(other);pending.push(other);}
    }
  }
  return [...known];
}
export function assembleVehicle(state:GameState,around:Position):Result{
  if(state.vehicle)return failure(state,'Desmonte ou estacione o veículo atual primeiro');
  const candidates=state.parts.filter(p=>
    (p.kind==='beam'||p.kind==='plate') &&
    Math.hypot(p.x-around.x,p.z-around.z)<8
  ).sort((a,b)=>Math.hypot(a.x-around.x,a.z-around.z)-Math.hypot(b.x-around.x,b.z-around.z));
  for(const anchor of candidates){
    const component=connectedComponent(state,anchor.id);
    const parts=state.parts.filter(p=>component.includes(p.id));
    if(parts.some(p=>Math.hypot(p.x-anchor.x,p.z-anchor.z)>8))continue;
    const valid=validateAssembly(state,component);
    if(!valid.ok)continue;
    const frame=parts.find(p=>p.kind==='beam'||p.kind==='plate')!;
    const next=copy(state);
    next.vehicle={
      partIds:component,
      originX:frame.x,originY:frame.y,originZ:frame.z,
      x:frame.x,y:frame.y,z:frame.z,
      yaw:0,charge:100,health:100,
      detachedWheelIds:[],distance:0
    };
    return {ok:true,state:next};
  }
  return failure(state,'Monte e solde 1 chassi, 4 rodas, 1 motor e 1 bateria (ou use Montagem rápida)');
}
export function buildBuggy(state:GameState,origin:Position):Result{
  if(state.vehicle)return failure(state,'Já existe um veículo montado');
  if(state.inventory.metal<CAR_KIT_COST.metal||state.inventory.copper<CAR_KIT_COST.copper)
    return failure(state,'Montagem rápida requer '+CAR_KIT_COST.metal+' metal e '+CAR_KIT_COST.copper+' cobre');
  const prefix='car-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,7);
  let current=copy(state);
  let anchorId='';
  const allIds:string[]=[];
  for(let index=0;index<CHASSIS_PARTS.length;index++){
    const item=CHASSIS_PARTS[index],id=prefix+'-'+index;
    const pos=snapPosition({x:origin.x+item.dx,y:origin.y+item.dy,z:origin.z+item.dz});
    const result=craftPart(current,item.kind,pos,id,item.rotation??0,item.length);
    if(!result.ok)return failure(state,result.error||'Materiais insuficientes');
    current=result.state;
    allIds.push(id);
    if(index===0)anchorId=id;
    else {
      const welded=weldParts(current,anchorId,id);
      if(!welded.ok)return failure(state,welded.error||'Falha na solda');
      current=welded.state;
    }
  }
  const built=assembleVehicle(current,{x:origin.x,y:origin.y+1,z:origin.z});
  if(!built.ok)return failure(state,built.error||'Falha ao montar');
  // The frame is the assembly's origin, not a duplicate external car mesh.
  return built;
}
export function repairVehicle(state:GameState):Result{
  const car=state.vehicle;
  if(!car)return failure(state,'Nenhum veículo para reparar');
  if(car.health>=100&&car.detachedWheelIds.length===0)return failure(state,'Veículo já está íntegro');
  const cost={metal:car.detachedWheelIds.length?3:2,copper:car.detachedWheelIds.length?1:0};
  if(state.inventory.metal<cost.metal||state.inventory.copper<cost.copper)
    return failure(state,'Reparo requer '+cost.metal+' metal'+(cost.copper?' e '+cost.copper+' cobre':''));
  const next=copy(state);
  next.inventory.metal-=cost.metal;next.inventory.copper-=cost.copper;
  next.vehicle!.health=Math.min(100,next.vehicle!.health+55);
  next.vehicle!.detachedWheelIds=[];
  return {ok:true,state:next};
}
export function rechargeVehicle(state:GameState):Result{
  if(!state.vehicle)return failure(state,'Nenhum veículo montado');
  if(state.vehicle.charge>=99.9)return failure(state,'Bateria já está carregada');
  if(state.inventory.copper<2)return failure(state,'Recarga requer 2 cobre');
  const next=copy(state);
  next.inventory.copper-=2;
  next.vehicle!.charge=Math.min(100,next.vehicle!.charge+55);
  return {ok:true,state:next};
}
export function applyCrashDamage(state:GameState,impulse:number,speed:number):Result{
  if(!state.vehicle||!Number.isFinite(impulse)||!Number.isFinite(speed)||speed<4)
    return failure(state,'Impacto insuficiente');
  const damage=Math.min(80,Math.max(4,Math.round((speed-3)*.85+Math.max(0,impulse)*.3)));
  const next=copy(state),car=next.vehicle!;
  car.health=Math.max(0,car.health-damage);
  if((damage>24||car.health<30)&&car.detachedWheelIds.length===0){
    const wheels=next.parts.filter(p=>car.partIds.includes(p.id)&&p.kind==='wheel');
    if(wheels.length)car.detachedWheelIds.push(wheels[Math.floor(speed)%wheels.length].id);
  }
  return {ok:true,state:next};
}
export function disassembleVehicle(state:GameState):GameState{
  const car=state.vehicle;
  if(!car)return state;
  const next=copy(state),detached=new Set(car.detachedWheelIds);
  const cosine=Math.cos(car.yaw),sine=Math.sin(car.yaw);
  next.parts=next.parts.filter(part=>!detached.has(part.id)).map(part=>{
    if(!car.partIds.includes(part.id))return part;
    const dx=part.x-car.originX,dz=part.z-car.originZ;
    return {...part,...snapPosition({
      x:car.x+dx*cosine+dz*sine,
      y:car.y+part.y-car.originY,
      z:car.z-dx*sine+dz*cosine
    }),rotation:((part.rotation+Math.round(car.yaw*180/Math.PI/90)*90)%360+360)%360};
  });
  next.welds=next.welds.filter(w=>!detached.has(w.a)&&!detached.has(w.b));
  next.vehicle=null;
  return next;
}

export const STARTER_CACHE_ID='salvage:workshop-wreck-01';
export function claimStarterCache(state:GameState):GameState{
  if(state.collected.includes(STARTER_CACHE_ID))return state;
  const next=copy(state);
  next.collected.push(STARTER_CACHE_ID);
  next.inventory.metal+=CAR_KIT_COST.metal;
  next.inventory.copper+=CAR_KIT_COST.copper;
  return next;
}
