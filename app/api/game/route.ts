import { getRoomStore, ROOM_TTL_MS } from "@/lib/room-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { addPlayer, advanceMatch, applyInput, createMatch, removePlayer, snapshot, type Input, type Match } from "@/lib/simulation";

interface Session { playerId: string; tokenHash: string; lastSeen: number; }
interface Payload { action?: string; name?: string; room?: string; token?: string; team?: string; input?: Partial<Input>; }
const ROOM_TTL = ROOM_TTL_MS;
const SESSION_TTL = 45_000;
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
class GameError extends Error { constructor(message:string, public status:number) { super(message); } }
const response = (body:unknown,status=200) => Response.json(body,{status,headers:{"Cache-Control":"no-store"}});
function code() { const bytes=crypto.getRandomValues(new Uint8Array(6));return Array.from(bytes,b=>ALPHABET[b%ALPHABET.length]).join(""); }
function token() { return Array.from(crypto.getRandomValues(new Uint8Array(32)),v=>v.toString(16).padStart(2,"0")).join(""); }
async function digest(value:string) { return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value))),v=>v.toString(16).padStart(2,"0")).join(""); }
function displayName(value:unknown) { return typeof value==="string"?value:"PLAYER"; }
function roomCode(value:unknown) {
  const room=typeof value==="string"?value.toUpperCase().trim():"";
  if(!/^[A-HJ-NP-Z2-9]{6}$/.test(room))throw new GameError("Enter a valid six-character room code.",400);
  return room;
}
export async function POST(request:Request) {
  try {
    const body=await request.text();
    if(body.length>8192)throw new GameError("Request is too large.",413);
    let payload:Payload;
    try { payload=JSON.parse(body) as Payload; } catch { throw new GameError("Expected a JSON game request.",400); }
    if(!payload||typeof payload!=="object"||Array.isArray(payload))throw new GameError("Invalid game request.",400);
    if(!["create","join","input","leave"].includes(payload.action??""))throw new GameError("Unknown game action.",400);
    const rooms = getRoomStore();
    const now=Date.now();
    if(payload.action==="create") {
      await rooms.prune(now-ROOM_TTL);
      const state=createMatch(now),player=addPlayer(state,displayName(payload.name),payload.team==="orange"?"orange":"blue");
      const secret=token(),sessions:Session[]=[{playerId:player.id,tokenHash:await digest(secret),lastSeen:now}];
      for(let attempt=0;attempt<4;attempt++) {
        const room=code();
        const created = await rooms.create({code:room,state:JSON.stringify(state),sessions:JSON.stringify(sessions),revision:0,updated_at:now});
        if(created)return response({room,token:secret,playerId:player.id,state:snapshot(state,player.id)},201);
      }
      throw new GameError("Could not reserve a room code. Please try again.",503);
    }
    const room=roomCode(payload.room);
    let tokenHash:string|null=null;
    if(payload.action!=="join") {
      if(typeof payload.token!=="string"||!/^[a-f0-9]{64}$/.test(payload.token))throw new GameError("Your room session has expired. Join again.",401);
      tokenHash=await digest(payload.token);
    }
    if(payload.action==="input"&&(!payload.input||typeof payload.input!=="object"||!Number.isSafeInteger(payload.input.seq)||(payload.input.seq??-1)<0)) {
      throw new GameError("Invalid player input sequence.",400);
    }
    const joinToken=payload.action==="join"?token():null;
    const joinHash=joinToken?await digest(joinToken):null;
    for(let attempt=0;attempt<10;attempt++) {
      const row=await rooms.get(room);
      if(!row||now-row.updated_at>ROOM_TTL)throw new GameError("Room not found or expired. Check the code or create a new room.",404);
      const state=JSON.parse(row.state) as Match;
      const tick=Math.max(Date.now(),row.updated_at,state.time);
      let sessions=JSON.parse(row.sessions) as Session[];
      const session=tokenHash?sessions.find(s=>s.tokenHash===tokenHash):undefined;
      if(payload.action!=="join"&&(!session||now-session.lastSeen>SESSION_TTL))throw new GameError("Your room session has expired. Join again.",401);
      const expired=sessions.filter(s=>now-s.lastSeen>SESSION_TTL);
      for(const stale of expired)removePlayer(state,stale.playerId);
      sessions=sessions.filter(s=>now-s.lastSeen<=SESSION_TTL);
      let playerId=session?.playerId;
      if(payload.action==="join") {
        advanceMatch(state,tick);
        if(state.players.filter(p=>!p.bot).length>=8)throw new GameError("This room is full. Try another room.",409);
        playerId=addPlayer(state,displayName(payload.name)).id;
        sessions.push({playerId,tokenHash:joinHash!,lastSeen:tick});
      } else if(payload.action==="leave") {
        advanceMatch(state,tick);removePlayer(state,playerId!);sessions=sessions.filter(s=>s.playerId!==playerId);
      } else {
        if(!state.players.some(p=>p.id===playerId&&!p.bot))throw new GameError("Player session not found. Join again.",401);
        applyInput(state,playerId!,payload.input!,tick);session!.lastSeen=Math.max(session!.lastSeen,tick);
      }
      const updated=await rooms.compareAndSwap({code:room,state:JSON.stringify(state),sessions:JSON.stringify(sessions),revision:row.revision+1,updated_at:tick},row.revision);
      if(!updated)continue;
      if(payload.action==="leave")return response({ok:true});
      return response({room,...(joinToken?{token:joinToken,playerId}:{}),state:snapshot(state,playerId)});
    }
    throw new GameError("The room is busy. Reconnecting…",409);
  } catch(error) {
    if(error instanceof GameError)return response({error:error.message},error.status);
    console.error("Game room request failed",error instanceof Error?error.message:"Unknown error");
    return response({error:"Online rooms are temporarily unavailable. Try again, or play solo practice."},503);
  }
}
