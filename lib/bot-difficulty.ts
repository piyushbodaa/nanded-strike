export type BotDifficulty = 'beginner' | 'easy' | 'normal' | 'hard';
export const DEFAULT_BOT_DIFFICULTY:BotDifficulty = 'beginner';
export const BOT_DIFFICULTY_OPTIONS:readonly {id:BotDifficulty;label:string;description:string}[] = [
  {id:'beginner',label:'Beginner',description:'Long reactions, frequent misses and short bursts. No HE or flash attacks. Bots deal 70% less damage to you.'},
  {id:'easy',label:'Easy',description:'Slower reactions, wider aim and long breaks between bursts. No HE or flash attacks. Standard damage.'},
  {id:'normal',label:'Normal',description:'Quicker reactions, steadier aim and grenade attacks, with a pause between bursts. Standard damage.'},
  {id:'hard',label:'Hard',description:'Fast reactions, accurate tracking and sustained bursts with grenade attacks. Standard damage.'},
];
export interface BotTuning {
  sightRange:number;fieldOfView:number;turnPerDecision:number;
  reactionMinMs:number;reactionMaxMs:number;aimError:number;initialAimError:number;
  burstMinMs:number;burstMaxMs:number;pauseMinMs:number;pauseMaxMs:number;reacquireMs:number;
  attackGrenades:boolean;humanDamageScale:number;
}
/** Accuracy error persists throughout an encounter; easier bots never converge to perfect aim. */
export const BOT_DIFFICULTIES:Readonly<Record<BotDifficulty,Readonly<BotTuning>>> = {
  beginner:{sightRange:36,fieldOfView:100,turnPerDecision:.16,reactionMinMs:2200,reactionMaxMs:3200,aimError:.07,initialAimError:.03,
    burstMinMs:80,burstMaxMs:130,pauseMinMs:2200,pauseMaxMs:3400,reacquireMs:1800,attackGrenades:false,humanDamageScale:.3},
  easy:{sightRange:48,fieldOfView:120,turnPerDecision:.24,reactionMinMs:1400,reactionMaxMs:2200,aimError:.04,initialAimError:.02,
    burstMinMs:100,burstMaxMs:180,pauseMinMs:1400,pauseMaxMs:2400,reacquireMs:1300,attackGrenades:false,humanDamageScale:1},
  normal:{sightRange:70,fieldOfView:160,turnPerDecision:.42,reactionMinMs:850,reactionMaxMs:1250,aimError:.014,initialAimError:.01,
    burstMinMs:160,burstMaxMs:280,pauseMinMs:600,pauseMaxMs:1000,reacquireMs:900,attackGrenades:true,humanDamageScale:1},
  hard:{sightRange:95,fieldOfView:210,turnPerDecision:.8,reactionMinMs:350,reactionMaxMs:600,aimError:.0015,initialAimError:.008,
    burstMinMs:250,burstMaxMs:500,pauseMinMs:180,pauseMaxMs:410,reacquireMs:600,attackGrenades:true,humanDamageScale:1},
};
export function normalizeBotDifficulty(value:unknown):BotDifficulty {
  return typeof value==='string'&&Object.hasOwn(BOT_DIFFICULTIES,value)?value as BotDifficulty:DEFAULT_BOT_DIFFICULTY;
}
