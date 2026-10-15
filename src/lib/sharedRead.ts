// Share only work currently in flight, never a cached response or player snapshot.
const pending = new Map<string, Promise<unknown>>();
export function sharedRead<T>(key:string,read:()=>Promise<T>):Promise<T> {
  const existing=pending.get(key);if(existing)return existing as Promise<T>;
  const task=Promise.resolve().then(read);pending.set(key,task);
  const clear=()=>{if(pending.get(key)===task)pending.delete(key);};
  void task.then(clear,clear);return task;
}
export function invalidateRead(key:string){pending.delete(key);}
