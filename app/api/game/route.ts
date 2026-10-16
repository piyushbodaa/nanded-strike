import { getRoomStore } from "@/lib/room-store";
import { createGameHandler } from "@/lib/game-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const POST = createGameHandler(getRoomStore);
