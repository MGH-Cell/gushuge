import fs from 'fs';

function rep(h, from, to, tag){
  const n = h.split(from).length - 1;
  if(n !== 1) throw new Error(tag+' found '+n+' times: '+from.slice(0,40));
  return h.replace(from, to);
}

const SETOBJ = `let objectiveText='';
function setObjective(t){
  objectiveText=t||'';
  clearTimeout(hintTimer);
  if(objectiveText){ hintEl.textContent=objectiveText; hintEl.classList.add('show'); }
  else hintEl.classList.remove('show');
}
function hint(t,ms){
  hintEl.textContent=t; hintEl.classList.add('show');
  clearTimeout(hintTimer);
  hintTimer=setTimeout(()=>{
    if(objectiveText) hintEl.textContent=objectiveText;
    else hintEl.classList.remove('show');
  },ms||2600);
}`;

const RIPPLE_DECL = `let petals=[];
let ripples=[];`;
const RIPPLE_CLICK = `  if(inDialog){ advanceDialog(); return; }
  ripples.push({x:p.x,y:p.y,l:0});`;
const RIPPLE_UPDATE = `  ripples.forEach(r=>r.l++);
  ripples=ripples.filter(r=>r.l<24);
`;
const RIPPLE_DRAW = `  // 点击涟漪反馈
  ripples.forEach(r=>{
    const rr=3+r.l*.9;
    g.globalAlpha=.55*(1-r.l/24);
    g.strokeStyle='#fff6c8'; g.lineWidth=1;
    g.beginPath(); g.ellipse(r.x,r.y,rr,rr*.55,0,0,Math.PI*2); g.stroke();
    g.globalAlpha=1;
  });
`;

/* ============ taohuayuan.html ============ */
let h = fs.readFileSync('taohuayuan.html','utf8');
h = rep(h, `position:fixed; bottom:2%; left:50%; transform:translateX(-50%);`,
           `position:fixed; top:52px; left:50%; transform:translateX(-50%);`, 'T-css');
h = rep(h, `speed:1.15`, `speed:2.1`, 'T-speed');
h = rep(h, `function hint(t,ms=2600){
  hintEl.textContent=t; hintEl.classList.add('show');
  clearTimeout(hintTimer);
  hintTimer=setTimeout(()=>hintEl.classList.remove('show'),ms);
}`, SETOBJ, 'T-hint');
h = rep(h, `    if(enterLines) openDialog(enterLines,null);
  });`, `    if(enterLines) openDialog(enterLines,null);
    else afterEnterHint();
  });`, 'T-goScene');
h = rep(h, `function afterEnterHint(){
  if(!inDialog){
    if(scene===0) hint('点击地面沿溪向右行船，留意里程……',3400);
    if(scene===1) hint('点击地上闪光的落英，拾取六片花瓣',3400);
    if(scene===2 && caveStage===0) hint('点击发光的山口，舍船入洞',3200);
    if(scene===3) hint('访闪光的良田、美池、桑竹、鸡犬，再与四位村人攀谈',3800);
    if(scene===4) hint('点击闪光处，在归途上处处做下记号（三处）',3600);
  }
}`, `function afterEnterHint(){
  if(inDialog) return;
  if(scene===0) setObjective(forestFound?'桃林已现，向右缘溪穿林而行 →':'点击地面沿溪向右行船，留意里程');
  if(scene===1) setObjective(gotPetals.size>=PETAL_HOT.length?'落英拾满，桃林尽处便是山口，向右而行 →':'点击地上闪光的落英，拾取六片花瓣');
  if(scene===2) setObjective(caveStage===0?'点击发光的山口，舍船入洞':caveStage===1?'洞中漆黑狭窄，点击前方空地摸黑前行':'豁然开朗——点击发光的山口出去 →');
  if(scene===3) setObjective(villageReady()?'村人良田皆已寻访，向右离开桃源 →':'访闪光的良田、美池、桑竹、鸡犬，再与四位村人攀谈');
  if(scene===4){
    if(!marks.every(Boolean)) setObjective('点击闪光处，在归途上处处做下记号（三处）');
    else if(!boatVisited) setObjective('点击溪边闪光的旧船登舟 →');
    else if(!steleVisited) setObjective('点击闪光的残碑——太守派人随他寻路');
    else if(!liuVisited) setObjective('与雾中高士刘子骥对话');
  }
}`, 'T-afterEnter');
h = rep(h, `setTimeout(()=>hint('桃花林已现，向右缘溪穿林而行 →',3400),900);`, `setTimeout(afterEnterHint,900);`, 'T-forest');
h = rep(h, `setTimeout(()=>hint('落英已拾满，桃林尽处便是山口，向右而行 →',3200),700);`, `setTimeout(afterEnterHint,700);`, 'T-petal');
h = rep(h, `  setHud('从口入……初极狭，才通人');
}`, `  setHud('从口入……初极狭，才通人');
  afterEnterHint();
}`, 'T-cave');
h = rep(h, `'又走了数十步，眼前忽然开阔明亮——山口之外别有天地！点击发光的山口出去。',4200);`,
           `'又走了数十步，眼前忽然开阔明亮——山口之外别有天地！点击发光的山口出去。',4200);
        afterEnterHint();`, 'T-bright');
h = rep(h, `      if(villageReady()){ hint('村人良田皆已寻访，向右离开桃源 →',3400); chime(); }`,
           `      if(villageReady()) chime();`, 'T-vready');
h = rep(h, `  if(villageReady()) hint('村人良田皆已寻访，向右离开桃源 →',3000);`,
           `  if(villageReady()) afterEnterHint();`, 'T-examine');
h = rep(h, `setTimeout(()=>hint('点击左侧闪光的旧船登舟 →',3000),600);`, `setTimeout(afterEnterHint,600);`, 'T-mark');
h = rep(h, `function openQuiz(){
  inDialog=true; quizOpen=true;`, `function openQuiz(){
  inDialog=true; quizOpen=true;
  setObjective('');`, 'T-quiz');
h = rep(h, `function showScroll(){`, `function showScroll(){
  setObjective('');`, 'T-scroll');
h = rep(h, `let petals=[];`, RIPPLE_DECL, 'T-rdecl');
h = rep(h, `  if(inDialog){ advanceDialog(); return; }`, RIPPLE_CLICK, 'T-rclick');
h = rep(h, `  // 花瓣
  petals.forEach(p=>{`, RIPPLE_UPDATE+`  // 花瓣
  petals.forEach(p=>{`, 'T-rupdate');
h = rep(h, `  // 花瓣在最上层（小菱形，随风翻转）`, RIPPLE_DRAW+`  // 花瓣在最上层（小菱形，随风翻转）`, 'T-rdraw');
fs.writeFileSync('taohuayuan.html', h);
console.log('taohuayuan OK');

/* ============ xiaoshitan.html ============ */
h = fs.readFileSync('xiaoshitan.html','utf8');
h = rep(h, `position:fixed; bottom:2%; left:50%; transform:translateX(-50%);`,
           `position:fixed; top:52px; left:50%; transform:translateX(-50%);`, 'X-css');
h = rep(h, `speed:1.15`, `speed:2.1`, 'X-speed');
h = rep(h, `function hint(t,ms=2600){
  hintEl.textContent=t; hintEl.classList.add('show');
  clearTimeout(hintTimer);
  hintTimer=setTimeout(()=>hintEl.classList.remove('show'),ms);
}`, SETOBJ, 'X-hint');
h = rep(h, `    if(enterLines) openDialog(enterLines,null);
  });`, `    if(enterLines) openDialog(enterLines,null);
    else afterEnterHint();
  });`, 'X-goScene');
h = rep(h, `function afterEnterHint(){
  if(!inDialog){
    if(scene===0) hint('点击地面向西行走，留意计数——要走满一百二十步',3400);
    if(scene===1) hint('竹丛挡道——点击发光的竹丛，砍竹取道（共三丛）',3400);
    if(scene===2) hint('与三位同游者攀谈，再点击潭边闪光的四块奇石',3600);
  }
}`, `function afterEnterHint(){
  if(inDialog) return;
  if(scene===0) setObjective(heardWater?'「百二十步」已到，向右穿出竹林 →':'点击地面向西行走——要走满「百二十步」');
  if(scene===1) setObjective(cutBamboo.every(Boolean)?'道路已开，向右缘溪前行 →':'竹丛挡道——点击发光的竹丛，砍竹取道（共三丛）');
  if(scene===2) setObjective((npcs.every(n=>n.talked)&&foundStones.size===STONES.length)?'石形已辨、三友已访，向右离开石潭 →':'与三位同游者攀谈，再点击潭边闪光的四块奇石');
  if(scene===3) setObjective(inscribed?'':(satDown?'去闪光的石壁题字为记':'点击上游闪光望一望溪源，再到平石上静坐'));
}`, 'X-afterEnter');
h = rep(h, `setTimeout(()=>hint('「百二十步」已到，向右穿出竹林 →',3200),1400);`, `setTimeout(afterEnterHint,1400);`, 'X-steps');
h = rep(h, `setTimeout(()=>hint('道路已开，向右缘溪前行 →',3200),600);`, `setTimeout(afterEnterHint,600);`, 'X-bamboo');
h = rep(h, `  if(foundStones.size===STONES.length && npcs.every(n=>n.talked))
    hint('四块奇石已辨，向右离开石潭 →',3000);`, `  if(foundStones.size===STONES.length && npcs.every(n=>n.talked))
    afterEnterHint();`, 'X-stone');
h = rep(h, `    if(scene===2 && npcs.every(n=>n.talked) && foundStones.size===STONES.length){
      hint('石形已辨、三友之言已毕，向右离开石潭 →');
      chime();
    } else if(scene===2 && npcs.every(n=>n.talked)){`, `    if(scene===2 && npcs.every(n=>n.talked) && foundStones.size===STONES.length){
      chime();
    } else if(scene===2 && npcs.every(n=>n.talked)){`, 'X-dlg');
h = rep(h, `function openQuiz(){
  inDialog=true; quizOpen=true;`, `function openQuiz(){
  inDialog=true; quizOpen=true;
  setObjective('');`, 'X-quiz');
h = rep(h, `function showScroll(){`, `function showScroll(){
  setObjective('');`, 'X-scroll');
h = rep(h, `let petals=[];`, RIPPLE_DECL, 'X-rdecl');
h = rep(h, `  if(inDialog){ advanceDialog(); return; }`, RIPPLE_CLICK, 'X-rclick');
h = rep(h, `  // 落叶
  petals.forEach(p=>{`, RIPPLE_UPDATE+`  // 落叶
  petals.forEach(p=>{`, 'X-rupdate');
h = rep(h, `  // 落叶在最上层`, RIPPLE_DRAW+`  // 落叶在最上层`, 'X-rdraw');
fs.writeFileSync('xiaoshitan.html', h);
console.log('xiaoshitan OK');

/* ============ loushiming.html ============ */
h = fs.readFileSync('loushiming.html','utf8');
h = rep(h, `position:fixed; bottom:2%; left:50%; transform:translateX(-50%);`,
           `position:fixed; top:52px; left:50%; transform:translateX(-50%);`, 'L-css');
h = rep(h, `speed:1.15`, `speed:2.1`, 'L-speed');
h = rep(h, `function hint(t,ms){
  hintEl.textContent=t; hintEl.classList.add('show');
  clearTimeout(hintTimer);
  hintTimer=setTimeout(()=>hintEl.classList.remove('show'),ms||2600);
}`, SETOBJ, 'L-hint');
h = rep(h, `    if(enterLines) openDialog(enterLines,null);
  });`, `    if(enterLines) openDialog(enterLines,null);
    else afterEnterHint();
  });`, 'L-goScene');
h = rep(h, `function afterEnterHint(){
  if(!inDialog){
    if(scene===0) hint('点击两处闪光：山顶仙云、潭中龙影',3400);
    if(scene===1) hint('点击柴门茅屋与阶前兰草',3200);
    if(scene===2) hint('细看阶上苔痕与帘外草色两处闪光',3400);
    if(scene===3) hint('与两位鸿儒攀谈，再调素琴、阅金经',3400);
    if(scene===4) hint('访丝竹架、案牍、两轴挂像，最后拜孔子牌位',3800);
  }
}`, `function afterEnterHint(){
  if(inDialog) return;
  if(scene===0) setObjective((sawImmortal&&sawDragon)?'山水已访，向右沿山径入巷 →':'点击两处闪光：山顶仙云、潭中龙影');
  if(scene===1) setObjective((sawHut&&sawOrchid)?'柴门与阶兰都看过了，向右入院 →':'点击柴门茅屋与阶前兰草');
  if(scene===2) setObjective((sawMoss&&sawGrass)?'苔痕草色皆已细看，向右入堂 →':'细看阶上苔痕与帘外草色两处闪光');
  if(scene===3) setObjective(scene3Ready()?'琴经雅事皆备，向右步入中堂 →':'与两位鸿儒攀谈，再调素琴、阅金经');
  if(scene===4) setObjective(sawKongzi?'':'访丝竹架、案牍、两轴挂像，最后拜孔子牌位');
}`, 'L-afterEnter');
h = rep(h, `if(sawDragon) hint('山水皆已寻访，向右沿山径入巷 →',3200);`, `if(sawDragon) afterEnterHint();`, 'L-imm');
h = rep(h, `if(sawImmortal) hint('山水皆已寻访，向右沿山径入巷 →',3200);`, `if(sawImmortal) afterEnterHint();`, 'L-dra');
h = rep(h, `if(sawOrchid) hint('柴门与阶兰都看过了，向右入院 →',3000);`, `if(sawOrchid) afterEnterHint();`, 'L-hut');
h = rep(h, `if(sawHut) hint('柴门与阶兰都看过了，向右入院 →',3000);`, `if(sawHut) afterEnterHint();`, 'L-orc');
h = rep(h, `if(sawGrass){ lit('s3'); hint('苔痕草色皆已细看，向右入堂 →',3000); }`, `if(sawGrass){ lit('s3'); afterEnterHint(); }`, 'L-moss');
h = rep(h, `if(sawMoss){ lit('s3'); hint('苔痕草色皆已细看，向右入堂 →',3000); }`, `if(sawMoss){ lit('s3'); afterEnterHint(); }`, 'L-grass');
h = rep(h, `if(readSutra){ lit('s5'); hint('琴经两般雅事皆备，向右入中堂 →',3200); }`, `if(readSutra){ lit('s5'); afterEnterHint(); }`, 'L-qin');
h = rep(h, `if(playedQin){ lit('s5'); hint('琴经两般雅事皆备，向右入中堂 →',3200); }`, `if(playedQin){ lit('s5'); afterEnterHint(); }`, 'L-sutra');
h = rep(h, `      if(scene3Ready()) hint('琴经两般雅事皆备，向右步入中堂 →',3400);
      else hint('再去抚一抚素琴、阅一阅金经吧',3000);
`, ``, 'L-ru');
h = rep(h, `function openExam(){
  inDialog=true; quizOpen=true;`, `function openExam(){
  inDialog=true; quizOpen=true;
  setObjective('');`, 'L-exam');
h = rep(h, `function showScroll(){`, `function showScroll(){
  setObjective('');`, 'L-scroll');
h = rep(h, `let petals=[];`, RIPPLE_DECL, 'L-rdecl');
h = rep(h, `  if(inDialog){ advanceDialog(); return; }`, RIPPLE_CLICK, 'L-rclick');
h = rep(h, `  // 竹叶苔点
  petals.forEach(p=>{`, RIPPLE_UPDATE+`  // 竹叶苔点
  petals.forEach(p=>{`, 'L-rupdate');
h = rep(h, `  // 竹叶苔点（最上层，小菱形随风翻转）`, RIPPLE_DRAW+`  // 竹叶苔点（最上层，小菱形随风翻转）`, 'L-rdraw');
fs.writeFileSync('loushiming.html', h);
console.log('loushiming OK');
