import type {GameState} from './game-state';
const DB='meujogo-saves';
const STORE='worlds';
function openDb():Promise<IDBDatabase>{
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open(DB,1);
    request.onupgradeneeded=()=>{
      const database=request.result;
      if(!database.objectStoreNames.contains(STORE))database.createObjectStore(STORE);
    };
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error);
  });
}
export async function loadGame():Promise<unknown>{
  const db=await openDb();
  return new Promise((resolve,reject)=>{
    const request=db.transaction(STORE,'readonly').objectStore(STORE).get('world-1');
    request.onsuccess=()=>{db.close();resolve(request.result??null);};
    request.onerror=()=>{db.close();reject(request.error);};
  });
}
export async function saveGame(data:GameState):Promise<void>{
  const db=await openDb();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(STORE,'readwrite');
    tx.objectStore(STORE).put(data,'world-1');
    tx.oncomplete=()=>{db.close();resolve();};
    tx.onerror=()=>{db.close();reject(tx.error);};
    tx.onabort=()=>{db.close();reject(tx.error);};
  });
}
