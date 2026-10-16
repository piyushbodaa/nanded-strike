/** Original relief geometry observed in IIB's own Parnakuti campus photographs.
 * The photographed facade is not used as a texture. Width, height and depth are
 * estimates fitted to the mapped building; the source does not supply a survey.
 * Local +z faces the street. All relief, including the shallow step representation,
 * stays between z=0 and z=.49; the parent owns the building's solid footprint.
 */
export type FacadeDraw = {
  box(x:number,y:number,z:number,w:number,h:number,d:number,color:string):void;
  text(value:string,x:number,y:number,z:number,w:number,h:number,fg:string,bg?:string,small?:string):void;
  rail(a:number[],b:number[],radius:number,color:string):void;
};

export function drawIibFacade(width:number,height:number,draw:FacadeDraw) {
  const {box,text,rail}=draw;
  const wall='#e8e9e4',pier='#f5f5ef',glass='#244c5c',glassDark='#173643';
  const frame='#667d80',grey='#5c666b',red='#cf3336',blue='#087da1';
  const x=(v:number)=>v*width,y=(v:number)=>v*height;
  const panel=(px:number,py:number,w:number,h:number,c:string,z=.075,d=.10)=>
    box(x(px),y(py),z,x(w),y(h),d,c);

  // Four white structural bays and three recessed blue, barred-window ribbons.
  panel(0,.5,1,1,wall,.055,.11);
  for(const level of [.39,.60,.81]) {
    for(const bay of [-.375,-.125,.125,.375]) {
      panel(bay,level,.225,.083,glass,.125,.035);
      panel(bay,level+.039,.23,.009,'#b6bab3',.17,.06);
      panel(bay,level-.042,.23,.012,pier,.19,.11);
      for(const fraction of [-.075,-.025,.025,.075]) {
        panel(bay+fraction,level,.0035,.079,frame,.185,.025);
      }
      for(const offset of [-.025,0,.025]) {
        panel(bay,level+offset,.224,.0026,frame,.19,.024);
      }
      // A dark upper reveal gives the strips depth without a transparent wall.
      panel(bay,level+.031,.225,.012,glassDark,.17,.027);
    }
  }
  for(const column of [-.49,-.25,0,.25,.49]) {
    panel(column,.59,column===0?.026:.025,.64,pier,.22,.23);
  }
  panel(0,.898,1.01,.018,pier,.23,.26);
  panel(0,.874,1,.012,'#afb5af',.155,.08);

  // The prominent dark, horizontal roof louvers and red IIB lettering.
  panel(0,.949,.99,.082,'#666b6c',.13,.15);
  for(let i=0;i<12;i++)panel(0,.912+i*.0065,.988,.0019,'#b6bcbb',.22,.018);
  text('IIB',x(-.075),y(.951),.285,x(.28),y(.102),'#e54142');
  // Simple original blue/green runner emblem beside the photographed lettering.
  const emblemX=x(.13),emblemY=y(.95),s=Math.min(width,height)*.045;
  box(emblemX+s*.27,emblemY+s*.62,.29,s*.20,s*.20,.045,'#087fb0');
  rail([emblemX+s*.10,emblemY+s*.30,.29],[emblemX+s*.52,emblemY+s*.21,.29],s*.10,'#00a678');
  rail([emblemX+s*.33,emblemY+s*.23,.29],[emblemX-s*.02,emblemY-s*.25,.29],s*.10,'#00a678');
  rail([emblemX-s*.02,emblemY-s*.25,.29],[emblemX-s*.36,emblemY-s*.46,.29],s*.095,'#00a678');
  rail([emblemX+s*.03,emblemY+s*.25,.29],[emblemX-s*.35,emblemY+s*.46,.29],s*.075,'#087fb0');

  // The ground-floor sign reads exactly as the inspected official photograph.
  panel(0,.294,.91,.055,pier,.14,.10);
  const sloganY=y(.294),sloganH=y(.041);
  text('THINK',x(-.337),sloganY,.22,x(.19),sloganH,blue);
  text('NEET',x(-.145),sloganY,.22,x(.18),sloganH,red);
  text('|',x(-.025),sloganY,.22,x(.026),sloganH,blue);
  text('THINK',x(.10),sloganY,.22,x(.20),sloganH,blue);
  text('IIB',x(.265),sloganY,.22,x(.12),sloganH,red);

  // Grey entrance surround, two dark door openings, centre pier and low steps.
  panel(0,.249,.75,.042,grey,.235,.24);
  panel(-.347,.137,.055,.184,grey,.225,.24);
  panel(.347,.137,.055,.184,grey,.225,.24);
  panel(-.155,.139,.294,.18,'#132526',.12,.035);
  panel(.155,.139,.294,.18,'#182b2c',.12,.035);
  panel(0,.139,.027,.19,pier,.215,.20);
  panel(-.295,.135,.009,.178,'#bfc7bf',.20,.035);
  panel(.295,.135,.009,.178,'#bfc7bf',.20,.035);
  panel(0,.225,.635,.009,'#c3c8c2',.25,.06);
  text('पर्णकुटी',x(.15),y(.249),.365,x(.25),y(.033),'#f4f1e5');
  text('विद्याशाखा',x(-.245),y(.249),.365,x(.18),y(.026),'#d94538');
  text('IIB',x(-.346),y(.174),.36,x(.052),y(.047),'#ffffff',red);
  for(let step=0;step<5;step++) {
    const top=y(.010+(step+1)*.007);
    const depth=.46-step*.075;
    box(0,top/2,depth/2+.015,x(.68),top,depth,step%2?'#b9baad':'#a5a99c');
    box(0,top+.008,depth+.016,x(.68),.016,.025,'#d7d8cc');
  }
  panel(-.14,.047,.25,.005,'#39775b',.105,.15);

  // Wall-mounted air conditioner visible above the right entrance in the photo.
  panel(.285,.342,.115,.044,'#c7c5b8',.30,.25);
  panel(.275,.342,.061,.032,'#696f69',.43,.02);
  for(let slat=0;slat<5;slat++)panel(.275,.33+slat*.006,.062,.0015,'#b3b4a7',.445,.012);
  panel(.325,.341,.02,.022,'#b5b6ac',.44,.015);
}
