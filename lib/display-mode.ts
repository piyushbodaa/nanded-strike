/** Native orientation changes only: rotating the canvas with CSS would misalign
 * touch input. API prerequisites: https://developer.mozilla.org/en-US/docs/Web/API/ScreenOrientation/lock
 * Fullscreen changes need a direct user gesture; see Element/requestFullscreen.
 */
export type DisplayMode='auto'|'landscape'|'portrait';
export type DisplayPlatform={
  orientation?:{lock?:(mode:'landscape'|'portrait')=>Promise<void>;unlock?:()=>void};
  isFullscreen:()=>boolean;
  requestFullscreen?:()=>Promise<void>;
  exitFullscreen?:()=>Promise<void>;
};
export type DisplayResult={locked:boolean;message:string};

export function browserDisplayPlatform():DisplayPlatform {
  const orientation=window.screen.orientation as ScreenOrientation & {lock?:(mode:'landscape'|'portrait')=>Promise<void>};
  return {
    orientation,
    isFullscreen:()=>!!document.fullscreenElement,
    requestFullscreen:document.fullscreenEnabled!==false&&document.documentElement.requestFullscreen
      ?()=>document.documentElement.requestFullscreen():undefined,
    exitFullscreen:document.exitFullscreen?()=>document.exitFullscreen():undefined,
  };
}

export function rotateHint(mode:DisplayMode) {
  if(mode==='auto')return 'Turn on auto rotate in your phone’s controls, then turn your phone. On iPhone, turn off Portrait Orientation Lock.';
  return `Turn your phone ${mode==='landscape'?'sideways':'upright'}. If the view stays fixed, turn on auto rotate; on iPhone, turn off Portrait Orientation Lock.`;
}

function releaseOrientation(platform:DisplayPlatform) {
  try{platform.orientation?.unlock?.();}catch{/* An unavailable unlock must not block manual rotation. */}
}

export async function requestDisplayMode(mode:DisplayMode,platform:DisplayPlatform):Promise<DisplayResult> {
  if(mode==='auto') {
    releaseOrientation(platform);
    return {locked:false,message:`The game follows your phone’s orientation. ${rotateHint(mode)}`};
  }
  if(!platform.orientation?.lock) {
    releaseOrientation(platform);
    return {locked:false,message:`This browser cannot rotate the screen for you. ${rotateHint(mode)}`};
  }
  // Most mobile browsers require fullscreen before locking. Installed web apps
  // may support locking without it, so a missing fullscreen API is not a veto.
  if(!platform.isFullscreen()&&platform.requestFullscreen) {
    try{await platform.requestFullscreen();}
    catch {
      releaseOrientation(platform);
      return {locked:false,message:`Full screen was not allowed, so the game could not lock ${mode}. ${rotateHint(mode)}`};
    }
  }
  try {
    await platform.orientation.lock(mode);
    return {locked:true,message:`${mode==='landscape'?'Landscape':'Portrait'} is locked. Choose Auto rotate to follow your phone again.`};
  }catch {
    releaseOrientation(platform);
    return {locked:false,message:`This browser could not lock ${mode}. ${rotateHint(mode)}`};
  }
}

export async function toggleDisplayFullscreen(platform:DisplayPlatform):Promise<string> {
  if(platform.isFullscreen()) {
    if(!platform.exitFullscreen)return 'Use your browser’s full-screen control to leave full screen.';
    try{await platform.exitFullscreen();return 'Full screen is off. Your browser may also release the orientation lock.';}
    catch{return 'The browser could not leave full screen. Use its full-screen control and try again.';}
  }
  if(!platform.requestFullscreen)return 'Full screen is unavailable in this browser. You can still play in portrait or landscape by turning your phone.';
  try{await platform.requestFullscreen();return 'Full screen is on.';}
  catch{return 'Full screen was not allowed. You can keep playing in this browser window.';}
}

/** Viewport shape is the actual game layout, including split-screen windows. */
export function viewportOrientation(width:number,height:number):Exclude<DisplayMode,'auto'> {
  return width>=height?'landscape':'portrait';
}
