export type Resource = 'metal'|'copper';
export type Inventory = Record<Resource,number>;
export type PartKind = 'connector'|'beam'|'plate'|'wheel'|'motor'|'battery'|'pipe';
export type Position = {x:number;y:number;z:number};
export interface Part extends Position {id:string;kind:PartKind;rotation:number;length:number}
export interface Weld {a:string;b:string}
export interface GameState {
  version:2;
  player:{x:number;z:number};
  inventory:Inventory;
  collected:string[];
  parts:Part[];
  welds:Weld[];
  savedAt:number;
}
export interface Blueprint {format:'meujogo-blueprint';version:1;parts:Part[];welds:Weld[]}
export interface Result {ok:boolean;state:GameState;error?:string}
export const PARTS:Record<PartKind,{label:string;cost:Inventory;length:number;adjustable:boolean;color:number;description:string}> = {
  connector:{label:'Conector',cost:{metal:1,copper:0},length:.5,adjustable:false,color:0xe5b85e,description:'Ponto de ligação mecânica'},
  beam:{label:'Viga',cost:{metal:2,copper:0},length:2,adjustable:true,color:0x97b0bc,description:'Estrutura cortável de aço'},
  plate:{label:'Chapa',cost:{metal:3,copper:0},length:2,adjustable:true,color:0x7b929b,description:'Plataforma de metal'},
  wheel:{label:'Roda',cost:{metal:3,copper:0},length:1,adjustable:false,color:0x26383d,description:'Peça para futuros veículos'},
  motor:{label:'Motor',cost:{metal:4,copper:2},length:1,adjustable:false,color:0xd97944,description:'Módulo mecânico'},
  battery:{label:'Bateria',cost:{metal:2,copper:3},length:1,adjustable:false,color:0x67baab,description:'Reserva de energia'},
  pipe:{label:'Tubo',cost:{metal:1,copper:1},length:2,adjustable:true,color:0xbf8b61,description:'Conduíte redimensionável'}
};
const kinds=Object.keys(PARTS) as PartKind[];
const finite=(value:unknown,fall=0)=>typeof value==='number'&&Number.isFinite(value)?value:fall;
const safe=(value:unknown)=>Math.max(0,Math.min(99999,Math.floor(finite(value))));
const isRecord=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
export const snap=(value:number,step=.5)=>Math.round(value/step)*step;
export function snapPosition(p:Position):Position {
  return {x:snap(p.x),y:snap(p.y),z:snap(p.z)};
}
export function initialState():GameState {
  return {version:2,player:{x:0,z:0},inventory:{metal:0,copper:0},collected:[],parts:[],welds:[],savedAt:0};
}
export function partCost(kind:PartKind,length=PARTS[kind].length):Inventory {
  const def=PARTS[kind],ratio=def.adjustable?Math.max(.5,Math.min(8,length))/def.length:1;
  return {metal:Math.ceil(def.cost.metal*ratio),copper:Math.ceil(def.cost.copper*ratio)};
}
export function restoreState(raw:unknown):GameState {
  const result=initialState();
  if(!isRecord(raw))return result;
  const pos=isRecord(raw.player)?raw.player:raw;
  result.player={x:Math.max(-10000,Math.min(10000,finite(pos.x))),z:Math.max(-10000,Math.min(10000,finite(pos.z)))};
  result.inventory=isRecord(raw.inventory)
    ?{metal:safe(raw.inventory.metal),copper:safe(raw.inventory.copper)}
    :{metal:safe(raw.inventory),copper:0};
  result.collected=Array.isArray(raw.collected)?Array.from(new Set(raw.collected.filter((s):s is string=>typeof s==='string'&&s.length<150))).slice(0,15000):[];
  if(Array.isArray(raw.parts)) {
    const ids=new Set<string>();
    for(const item of raw.parts.slice(0,1500)){
      if(!isRecord(item)||typeof item.id!=='string'||ids.has(item.id)||item.id.length>100||!kinds.includes(item.kind as PartKind))continue;
      const kind=item.kind as PartKind,def=PARTS[kind];
      const length=def.adjustable?Math.max(.5,Math.min(8,snap(finite(item.length,def.length)))):def.length;
      const {x,y,z}=snapPosition({x:finite(item.x),y:finite(item.y),z:finite(item.z)});
      if(Math.max(Math.abs(x),Math.abs(y),Math.abs(z))>10000)continue;
      result.parts.push({id:item.id,kind,x,y,z,length,rotation:Math.round(finite(item.rotation)/90)*90%360});
      ids.add(item.id);
    }
  }
  if(Array.isArray(raw.welds)){
    for(const pair of raw.welds.slice(0,2000)){
      if(!isRecord(pair)||typeof pair.a!=='string'||typeof pair.b!=='string'||pair.a===pair.b)continue;
      if(!result.parts.some(p=>p.id===pair.a)||!result.parts.some(p=>p.id===pair.b))continue;
      if(result.welds.some(w=>samePair(w.a,w.b,pair.a as string,pair.b as string)))continue;
      result.welds.push({a:pair.a,b:pair.b});
    }
  }
  result.savedAt=finite(raw.savedAt);
  return result;
}
function samePair(a:string,b:string,c:string,d:string){return a===c&&b===d||a===d&&b===c;}
function copy(state:GameState):GameState {
  return {...state,player:{...state.player},inventory:{...state.inventory},collected:[...state.collected],parts:state.parts.map(p=>({...p})),welds:state.welds.map(w=>({...w}))};
}
const failed=(state:GameState,error:string):Result=>({ok:false,state,error});
export function collectScrap(state:GameState,id:string,resource:Resource):GameState {
  if(!id||state.collected.includes(id))return state;
  const next=copy(state);next.collected.push(id);next.inventory[resource]++;return next;
}
export function craftPart(state:GameState,kind:PartKind,position:Position,id:string,rotation=0,length=PARTS[kind]?.length):Result {
  if(!PARTS[kind]||!id||state.parts.some(p=>p.id===id)||state.parts.length>=1500)return failed(state,'Peça inválida ou limite atingido');
  if(![position.x,position.y,position.z,rotation,length].every(Number.isFinite))return failed(state,'Coordenadas inválidas');
  if(Math.max(Math.abs(position.x),Math.abs(position.y),Math.abs(position.z))>10000)return failed(state,'Fora do mundo');
  const def=PARTS[kind],size=def.adjustable?Math.max(.5,Math.min(8,snap(length))):def.length;
  const cost=partCost(kind,size);
  if(state.inventory.metal<cost.metal||state.inventory.copper<cost.copper)return failed(state,'Sucata insuficiente');
  const next=copy(state);next.inventory.metal-=cost.metal;next.inventory.copper-=cost.copper;
  next.parts.push({id,kind,...snapPosition(position),rotation:((Math.round(rotation/90)*90)%360+360)%360,length:size});
  return {ok:true,state:next};
}
export function removePart(state:GameState,id:string):GameState {
  const part=state.parts.find(p=>p.id===id);if(!part)return state;
  const next=copy(state),cost=partCost(part.kind,part.length);
  next.parts=next.parts.filter(p=>p.id!==id);
  next.welds=next.welds.filter(w=>w.a!==id&&w.b!==id);
  next.inventory.metal+=Math.floor(cost.metal/2);
  next.inventory.copper+=Math.floor(cost.copper/2);
  return next;
}
export function movePart(state:GameState,id:string,p:Position):GameState {
  const part=state.parts.find(part=>part.id===id);if(!part||![p.x,p.y,p.z].every(Number.isFinite))return state;
  const next=copy(state),target=next.parts.find(piece=>piece.id===id)!;
  Object.assign(target,snapPosition(p));
  next.welds=next.welds.filter(w=>{
    if(w.a!==id&&w.b!==id)return true;
    const partner=next.parts.find(piece=>piece.id===(w.a===id?w.b:w.a));
    return !!partner&&distance(target,partner)<=3.25;
  });
  return next;
}
export function rotatePart(state:GameState,id:string):GameState {
  const next=copy(state),part=next.parts.find(p=>p.id===id);
  if(!part)return state;
  part.rotation=(part.rotation+90)%360;return next;
}
export function resizePart(state:GameState,id:string,newLength:number):Result {
  const part=state.parts.find(p=>p.id===id);
  if(!part||!PARTS[part.kind].adjustable)return failed(state,'Peça não pode ser cortada');
  if(!Number.isFinite(newLength)||newLength<.5||newLength>8)return failed(state,'Comprimento entre 0,5 m e 8 m');
  const length=snap(newLength),old=partCost(part.kind,part.length),now=partCost(part.kind,length);
  const diff={metal:now.metal-old.metal,copper:now.copper-old.copper};
  if(state.inventory.metal<diff.metal||state.inventory.copper<diff.copper)return failed(state,'Faltam materiais para ampliar');
  const next=copy(state),target=next.parts.find(p=>p.id===id)!;target.length=length;
  next.inventory.metal-=diff.metal;next.inventory.copper-=diff.copper;
  return {ok:true,state:next};
}
export function distance(a:Position,b:Position):number{return Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);}
export function weldParts(state:GameState,a:string,b:string):Result {
  if(a===b)return failed(state,'Escolha duas peças diferentes');
  const one=state.parts.find(p=>p.id===a),two=state.parts.find(p=>p.id===b);
  if(!one||!two)return failed(state,'Peças não encontradas');
  if(distance(one,two)>3.25)return failed(state,'Peças muito afastadas para soldar');
  if(state.welds.some(w=>samePair(w.a,w.b,a,b)))return failed(state,'Conexão já existe');
  const next=copy(state);next.welds.push({a,b});return {ok:true,state:next};
}
export function makeBlueprint(state:GameState):Blueprint {
  const parts=state.parts.map(p=>({...p}));
  const origin=parts[0];
  if(origin)for(const p of parts){p.x-=origin.x;p.y-=origin.y;p.z-=origin.z;}
  return {format:'meujogo-blueprint',version:1,parts,welds:state.welds.map(w=>({...w}))};
}
export function installBlueprint(state:GameState,raw:unknown,origin:Position):Result {
  if(!isRecord(raw)||raw.format!=='meujogo-blueprint'||raw.version!==1||!Array.isArray(raw.parts)||!Array.isArray(raw.welds))return failed(state,'Blueprint inválido');
  if(raw.parts.length===0||raw.parts.length>100||state.parts.length+raw.parts.length>1500)return failed(state,'Blueprint vazio ou muito grande');
  if(![origin.x,origin.y,origin.z].every(Number.isFinite))return failed(state,'Posição inválida');
  const temporary=restoreState({parts:raw.parts,welds:raw.welds});
  if(temporary.parts.length!==raw.parts.length)return failed(state,'Blueprint contém peças inválidas');
  const ids=new Set(temporary.parts.map(p=>p.id));
  if(ids.size!==temporary.parts.length)return failed(state,'IDs duplicados');
  const costs=temporary.parts.reduce((sum,part)=>{const cost=partCost(part.kind,part.length);sum.metal+=cost.metal;sum.copper+=cost.copper;return sum;},{metal:0,copper:0});
  if(state.inventory.metal<costs.metal||state.inventory.copper<costs.copper)return failed(state,'Materiais insuficientes para o blueprint');
  const next=copy(state);
  const prefix='bp-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8)+'-';
  const mapping=new Map<string,string>();
  temporary.parts.forEach((p,index)=>{
    const id=prefix+index;mapping.set(p.id,id);
    next.parts.push({...p,id,...snapPosition({x:p.x+origin.x,y:p.y+origin.y,z:p.z+origin.z})});
  });
  for(const weld of temporary.welds)next.welds.push({a:mapping.get(weld.a)!,b:mapping.get(weld.b)!});
  next.inventory.metal-=costs.metal;next.inventory.copper-=costs.copper;
  return {ok:true,state:next};
}
