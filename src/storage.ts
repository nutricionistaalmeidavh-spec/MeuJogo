export type SaveData={x:number;z:number;inventory:number;collected:string[];savedAt:number};
const DB='meujogo-saves',STORE='worlds';
function openDb():Promise<IDBDatabase>{return new Promise((resolve,reject)=>{const req=indexedDB.open(DB,1);req.onupgradeneeded=()=>{req.result.createObjectStore(STORE);};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
export async function loadGame():Promise<SaveData|null>{const db=await openDb();return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readonly');const req=tx.objectStore(STORE).get('world-1');req.onsuccess=()=>{db.close();resolve(req.result??null);};req.onerror=()=>{db.close();reject(req.error);};});}
export async function saveGame(data:SaveData):Promise<void>{const db=await openDb();return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).put(data,'world-1');tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>{db.close();reject(tx.error);};});}
