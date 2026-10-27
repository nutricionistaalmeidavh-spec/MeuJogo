/** Funções puras de dinâmica veicular, testáveis sem carregar o motor WASM. */
const clamp=(v:number,min:number,max:number)=>Math.max(min,Math.min(max,v));
export function wheelSpring(compression:number,verticalSpeed:number):number{
  return clamp(compression*7600-verticalSpeed*950,0,10500);
}
export function motorForce(throttle:number,speed:number,charge:number,health:number):number{
  if(charge<=0||health<=0||Math.abs(speed)>=27)return 0;
  return clamp(throttle,-1,1)*(throttle>=0?2200:1150)*(.5+.5*health/100);
}
export function steerStrength(speed:number):number{
  const s=Math.abs(speed);
  if(s<.2)return 0;
  return clamp(s/3,0,1)*clamp(1-s/35,.2,1);
}
export function energyUsed(throttle:number,dt:number):number{
  return dt*(Math.abs(throttle)>.03?.065+Math.abs(throttle)*.36:0);
}
export function wheelGrip(active:number):number{
  return clamp(active,0,4)/4;
}
