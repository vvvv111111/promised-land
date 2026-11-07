import room from "./room.json";
export function inside(x: number,y: number,polygon: number[][]): boolean {
 let result=false;
 for(let i=0,j=polygon.length-1;i<polygon.length;j=i++) {
 const [ax,ay]=polygon[i], [bx,by]=polygon[j];
 if((ay>y)!==(by>y) && x<(bx-ax)*(y-ay)/(by-ay)+ax) result=!result;
 } return result;
}
export function canPlace(assetId: string,surfaceId: string,x: number,y: number, width = 0) {
 const a=room.assets.find(a=>a.id===assetId), s=room.surfaces.find(s=>s.id===surfaceId);
 return !!a && !!s && a.allowed.includes(s.kind) && inside(x,y,s.polygon) && inside(x-width/4,y-1,s.polygon) && inside(x+width/4,y-1,s.polygon);
}
