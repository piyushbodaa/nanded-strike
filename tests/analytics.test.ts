import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const source=readFileSync('public/analytics.js','utf8');
function setup(host='cs.nanded.fun'){
 const listeners: Record<string, (event: {detail: Record<string, unknown>}) => void> = {};
 const scripts: object[] = [];
 const window: {dataLayer: IArguments[]; addEventListener: (name: string, fn: (event: {detail: Record<string, unknown>}) => void) => void} = {dataLayer: [], addEventListener:(name,fn)=>listeners[name]=fn};
 const context={window,location:{hostname:host,href:'https://'+host+'/?room=PRIVATE&name=SECRET#token'},document:{createElement:()=>({}),head:{appendChild:(s: object)=>scripts.push(s)}},Set,Date};
 vm.runInNewContext(source,context);return{context,window,listeners,scripts};
}
const state=setup();vm.runInNewContext(source,state.context);
const commands=()=>state.window.dataLayer.map(args=>Array.from(args));
assert.equal(state.scripts.length,1);assert.equal(commands().filter(x=>x[1]==='page_view').length,1);
state.listeners['nanded:analytics']({detail:{name:'game_start',mode:'explore',player:'SECRET',room:'PRIVATE',coordinates:[1,2]}});
state.listeners['nanded:analytics']({detail:{name:'chat',mode:'SECRET'}});
state.listeners['nanded:analytics']({detail:{name:'game_end',mode:'SECRET'}});
assert.equal(commands().filter(x=>x[1]==='game_start').length,1);
assert.ok(!JSON.stringify(commands()).match(/SECRET|PRIVATE|coordinates|player|room=/));
const config=commands().find(x=>x[0]==='config');
assert.ok(config);
assert.equal(config[2].send_page_view,false);
assert.equal(config[2].allow_google_signals,false);
assert.equal(config[2].cookie_domain,'cs.nanded.fun');
assert.equal(config[2].page_location,'https://cs.nanded.fun/');
assert.equal(setup('localhost').scripts.length,0);assert.equal(setup('preview.vercel.app').scripts.length,0);
assert.equal(setup('counterstrike.nanded.fun').scripts.length,0);
console.log('PASS: initialization deduplication, one page view, production hostname gating, field/event allowlists, URL sanitization, advertising disabled.');
