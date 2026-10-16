import type { FacadeDraw } from './iib-facade';

/** Original relief meshes observed in Konale's official NEET-centre photograph
 * and June 2025 Google Street View of RCC's Shyam Nagar Road frontage.
 * Dimensions are estimated, fitted to source footprints by the parent renderer.
 * Local origin: bottom centre; +z faces the road. Relief stays in z=0..0.49m.
 * References and coordinate caveats are recorded in landmark-reference.json.
 */
export function drawKonaleFacade(width:number,height:number,draw:FacadeDraw) {
  const {box,text,rail}=draw;
  const x=(v:number)=>v*width,y=(v:number)=>v*height;
  const panel=(px:number,py:number,w:number,h:number,c:string,z=.075,d=.10)=>
    box(x(px),y(py),z,x(w),y(h),d,c);
  const plaster='#e7ebe3',trim='#f5f6ed',glass='#153c3d',frame='#796f50';

  // Off-white flat-roof block, with the taller upper right wing in the source.
  panel(0,.5,1,1,plaster,.045,.09);
  panel(0,.98,1.01,.025,trim,.14,.19);
  panel(-.08,.708,.83,.017,trim,.15,.12);
  panel(-.24,.704,.009,.53,'#c7cfc4',.13,.025);
  panel(.16,.83,.014,.30,'#c9d2c7',.14,.035);

  // The photograph has individual dark windows, not a uniform office curtain wall.
  for(const px of [-.45,-.37,-.25,.23,.335,.445]) {
    const pw=px<0?.041:.065;
    panel(px,.864,pw+.018,.115,trim,.125,.11);
    panel(px,.864,pw,.091,glass,.19,.025);
    panel(px,.864,.0035,.087,'#92a2a1',.215,.018);
  }
  for(const px of [-.19,.01]) {
    panel(px,.738,.14,.16,'#3d4944',.13,.035);
    panel(px,.745,.118,.137,glass,.165,.025);
    panel(px,.755,.12,.009,'#dde8df',.20,.025);
    panel(px,.71,.004,.061,'#8d9f94',.21,.02);
  }
  panel(.125,.74,.038,.082,'#2f3b36',.17,.025);

  // Brown-framed glazed projection above the right entrance is its key silhouette.
  panel(.305,.547,.38,.195,glass,.22,.26);
  for(const px of [.115,.23,.355,.495])panel(px,.547,.011,.208,frame,.38,.10);
  for(const py of [.448,.566,.645])panel(.305,py,.392,.010,frame,.39,.10);
  panel(.296,.637,.38,.017,trim,.29,.22);
  panel(.419,.507,.13,.095,'#264142',.37,.025);
  panel(.419,.492,.13,.007,'#8aa7a1',.398,.02);

  // Long result banner along the left balcony; no student identities are invented.
  panel(-.203,.601,.592,.082,'#fcfcf6',.29,.16);
  text('CHAMPIONS OF NEET',x(-.203),y(.612),.39,x(.53),y(.031),'#f8dc33','#184996');
  text('KONALE CLASSES',x(-.203),y(.576),.39,x(.45),y(.025),'#d6262d');
  for(let i=0;i<9;i++) {
    const px=-.45+i*.064;
    panel(px,.586,.023,.013,'#2d5693',.386,.012);
  }
  // Small blue/red C emblems at the two ends, recreated with ordinary lettering.
  text('C',x(-.474),y(.621),.398,x(.041),y(.052),'#e3363c');
  text('C',x(.081),y(.621),.398,x(.041),y(.052),'#e3363c');

  // Grey louvered ground-floor band, white fascia and dark open entrance.
  panel(-.20,.447,.60,.092,'#8b948b',.13,.04);
  for(let i=0;i<25;i++)panel(-.484+i*.024,.447,.004,.088,'#b8c0b4',.17,.023);
  panel(-.20,.385,.60,.025,trim,.21,.17);
  panel(-.20,.241,.60,.26,'#5c645b',.08,.03);
  for(const px of [-.485,-.31,-.13,.08])panel(px,.25,.018,.28,plaster,.21,.17);
  panel(.305,.23,.34,.24,'#172722',.13,.035);
  panel(.305,.375,.392,.125,'#fffef6',.29,.20);
  text('KONALE NEET CENTER',x(.305),y(.399),.405,x(.37),y(.043),'#ce1722');
  text('FOUNDATION',x(.22),y(.352),.405,x(.20),y(.038),'#163449');
  for(let i=0;i<5;i++) {
    const colors=['#1c98bd','#e95e9b','#d43239','#68a84e','#283d79'];
    text(String(i+6),x(.355+i*.029),y(.35),.41,x(.023),y(.023),'#ffffff',colors[i]);
  }
  // Colourful exam information panels visible beside the ground entrance.
  for(let i=0;i<5;i++) {
    const px=-.44+i*.099;
    panel(px,.227,.078,.166,'#f8df35',.24,.10);
    panel(px,.255,.07,.094,'#13448b',.30,.022);
    text(i%2?'NEET':'KONALE',x(px),y(.18),.325,x(.067),y(.024),'#c3222d');
  }
  // Shallow representation of the photographed steps; no untracked forecourt wall.
  for(let step=0;step<4;step++) {
    const top=y(.012+(step+1)*.010),depth=.47-step*.09;
    box(x(.302),top/2,depth/2+.012,x(.315),top,depth,'#aaa99b');
    box(x(.302),top+.009,depth+.018,x(.315),.018,.018,'#e0e1d3');
  }
  for(const px of [.14,.46]) {
    rail([x(px),y(.065),.06],[x(px),y(.16),.06],.022,'#b5bcb3');
    rail([x(px),y(.16),.06],[x(px),y(.14),.43],.022,'#b5bcb3');
  }
  text('कोनाले',x(.30),y(.994),.18,x(.19),y(.055),'#a13f73');
}

export function drawRccFacade(width:number,height:number,draw:FacadeDraw) {
  const {box,text,rail}=draw;
  const x=(v:number)=>v*width,y=(v:number)=>v*height;
  const panel=(px:number,py:number,w:number,h:number,c:string,z=.075,d=.10)=>
    box(x(px),y(py),z,x(w),y(h),d,c);
  const cream='#dedfd2',stone='#93988c',glass='#436577',dark='#172524';

  // Tall cream frontage with incised horizontal courses and grey asymmetric frames.
  panel(0,.5,1,1,cream,.05,.10);
  for(let i=0;i<36;i++)panel(0,.22+i*.021,1,.0018,'#bec3b6',.112,.015);
  panel(-.456,.57,.072,.85,'#c6cbbd',.17,.21);
  panel(.457,.56,.079,.84,'#c6cbbd',.17,.21);
  panel(-.25,.84,.38,.25,stone,.185,.23);
  panel(-.26,.811,.23,.068,dark,.31,.025);
  panel(-.26,.811,.20,.048,glass,.331,.018);

  // Two distinctive vertical black louver slots, one long and one segmented.
  panel(-.284,.502,.078,.365,dark,.16,.035);
  for(let i=0;i<38;i++)panel(-.284,.326+i*.0094,.076,.002,'#707a70',.192,.018);
  for(const [cy,ch] of [[.76,.145],[.58,.18],[.388,.17]]) {
    panel(.055,cy,.071,ch,dark,.16,.035);
    const rows=Math.floor(ch*100);
    for(let i=0;i<rows;i++)panel(.055,cy-ch/2+.004+i*.01,.069,.002,'#768174',.192,.018);
  }

  // Stacked right-hand windows with prominent alternating grey/cream surrounds.
  for(const [cy,c] of [[.35,stone],[.554,cream],[.752,stone]] as const) {
    panel(.302,cy,.342,.185,c,.19,.25);
    panel(.302,cy,.228,.112,cream,.325,.035);
    panel(.302,cy,.195,.082,dark,.352,.022);
    panel(.302,cy,.181,.068,glass,.369,.015);
    for(const px of [.244,.302,.36])panel(px,cy,.003,.068,'#a7b5b0',.389,.015);
    for(let line=0;line<5;line++)panel(.302,cy-.028+line*.014,.181,.002,'#9aaea9',.39,.014);
    panel(.302,cy-.096,.36,.018,'#c0c4b7',.27,.30);
  }
  panel(.30,.931,.35,.083,'#333e37',.18,.12);
  for(let i=0;i<9;i++)panel(.16+i*.034,.931,.004,.074,'#8c988a',.25,.02);
  panel(.295,.979,.39,.018,'#4b5d4d',.30,.31);
  panel(0,.997,.99,.012,'#b9beae',.19,.23);

  // Black name board with the photographed red RCC lettering over the entrance.
  panel(.297,.268,.385,.074,'#282f2a',.25,.20);
  text('RCC',x(.278),y(.265),.36,x(.254),y(.057),'#d8383c');
  text('प्रा. मोटेगावकर सरांचे',x(.28),y(.296),.365,x(.25),y(.016),'#eeeee2');
  // Original three-stroke flame motif observed next to the wordmark.
  const flameX=x(.442),flameY=y(.276),s=Math.min(width,height)*.035;
  rail([flameX-s*.20,flameY-s*.35,.375],[flameX+s*.18,flameY+s*.12,.375],s*.13,'#e6683a');
  rail([flameX+s*.18,flameY+s*.12,.375],[flameX-s*.08,flameY+s*.58,.375],s*.12,'#e6683a');
  rail([flameX-s*.02,flameY-s*.20,.39],[flameX+s*.09,flameY+s*.25,.39],s*.08,'#ecc458');

  // Deep entrance, stone steps and slender rails; all lie inside a 0.49m relief.
  panel(.292,.129,.29,.19,'#172222',.12,.035);
  panel(.12,.145,.035,.20,cream,.22,.18);
  panel(.464,.145,.035,.20,cream,.22,.18);
  panel(.29,.217,.36,.019,'#5b6054',.27,.22);
  for(let step=0;step<6;step++) {
    const top=y(.009+(step+1)*.006),depth=.47-step*.062;
    box(x(.29),top/2,depth/2+.012,x(.30),top,depth,'#5a625a');
    box(x(.29),top+.007,depth+.018,x(.30),.014,.018,'#a5ada1');
  }
  for(const px of [.16,.42]) {
    rail([x(px),y(.04),.08],[x(px),y(.114),.08],.021,'#aab4ac');
    rail([x(px),y(.114),.08],[x(px),y(.09),.44],.022,'#aab4ac');
    rail([x(px),y(.016),.44],[x(px),y(.09),.44],.02,'#aab4ac');
  }

  // Forecourt wall and exam hoarding are relief only; no personal faces/results.
  panel(-.19,.067,.55,.132,'#b9a58a',.17,.20);
  for(let i=0;i<7;i++)panel(-.19,.015+i*.017,.55,.002,'#dfcfb3',.279,.012);
  for(let row=0;row<6;row++)for(let i=0;i<5;i++) {
    const px=-.447+i*.11+(row%2?.055:0);
    if(px<.085)panel(px,.02+row*.017,.002,.014,'#ded1bb',.28,.012);
  }
  panel(-.19,.203,.56,.147,'#eddd73',.27,.16);
  text('JEE · NEET',x(-.19),y(.25),.36,x(.46),y(.022),'#263931');
  text('RCC',x(-.19),y(.21),.36,x(.30),y(.06),'#cf3540');
  text('NANDED',x(-.19),y(.164),.36,x(.48),y(.026),'#f4f1cd','#205297');
}
