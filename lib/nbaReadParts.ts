export async function boundedParts<T>(items:readonly T[],load:(item:T)=>Promise<void>){
 for(let i=0;i<items.length;i+=6)await Promise.all(items.slice(i,i+6).map(load));
}
