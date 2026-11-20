(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.InsweepRewards=api;
})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  // These are learning milestones, never rewards for profit or trading volume.
  const catalog=Object.freeze([
    {id:'first-position',title:'Первый шаг',description:'Открыл первую учебную позицию.',xp:10,icon:'↗'},
    {id:'direction',title:'Направление понятно',description:'Верно ответил на вопрос о лонге и шорте.',xp:15,icon:'↕'},
    {id:'fees',title:'Вижу расходы',description:'Проверил, как комиссии влияют на результат.',xp:15,icon:'◎'},
    {id:'intro-mastered',title:'Первое знакомство пройдено',description:'Проверил направление и расходы сделки.',xp:30,icon:'✓'},
    {id:'levels',title:'Два выхода',description:'Поставил стоп и цель с нужных сторон цены.',xp:10,icon:'⌁'},
    {id:'risk',title:'Риск в цифрах',description:'Проверил учебный бюджет и размер позиции.',xp:15,icon:'◈'},
    {id:'frozen-plan',title:'План до действия',description:'Зафиксировал план до продолжения истории.',xp:25,icon:'▣'},
    {id:'patient-entry',title:'Дождался условия',description:'Вошёл после ожидания своего условия.',xp:25,icon:'◷'},
    {id:'planned-exit',title:'Выход по плану',description:'Завершил позицию по условию стопа или цели.',xp:25,icon:'⚑'},
    {id:'deliberate-skip',title:'Осознанный пропуск',description:'Пропустил план, пока условие входа не выполнено.',xp:20,icon:'Ⅱ'},
    {id:'practice',title:'План проверен',description:'Прошёл проверку плана и объяснения в практике.',xp:40,icon:'✦'},
    {id:'independent',title:'Самостоятельный план',description:'Прошёл проверку нового плана без подсказок.',xp:60,icon:'◆'},
    {id:'leverage-basics',title:'Различаю объём и плечо',description:'Проверил три опыта с количеством, обеспечением и денежным риском.',xp:40,icon:'⇄'}
  ].map(item=>Object.freeze(item)));
  const lessonIds=['intro','plan','practice','assessment','leverage'];
  const thresholds=[0,30,70,120,190,260];
  const names=['Первый шаг','Проверяю себя','Собираю план','Действую по условию','Практикую осознанно','Учусь самостоятельно'];
  const array=value=>Array.isArray(value)?value:[];
  const frozenPlan=p=>!!p&&typeof p==='object'&&Number.isInteger(p.createdIndex)&&p.createdIndex>=0;
  const actualPosition=p=>!!p&&typeof p==='object'&&Number.isInteger(p.index)&&Number.isFinite(p.entry)&&p.entry>0&&Number.isFinite(p.qty)&&p.qty>0&&Number.isFinite(p.allocated)&&p.allocated>0;

  function collect(lessons={},existingIds=[]){
    const get=id=>lessons?.[id]||{};
    const intro=get('intro'),practice=get('practice'),assessment=get('assessment');
    const later=lessonIds.slice(1).map(get);
    const positions=later.flatMap(s=>[s.position,...array(s.trades)]).filter(Boolean);
    const decisions=later.flatMap(s=>array(s.decisions));
    const plans=[...later.map(s=>s.plan),...positions.flatMap(p=>[p.plan,p.originalPlan]),...decisions.map(d=>d.plan)].filter(frozenPlan);
    // A successful practice check also creates a plan-shaped draft. Commitment
    // happens at armed/actual-entry/history, not merely when createdIndex exists.
    const committedPlans=[...later.filter(s=>s.stage==='armed'||s.stage==='hold'&&actualPosition(s.position)).map(s=>s.plan),...positions.filter(actualPosition).flatMap(p=>[p.plan,p.originalPlan]),...decisions.map(d=>d.plan)].filter(frozenPlan);
    const proof={
      'first-position':actualPosition(intro.position)||array(intro.trades).some(actualPosition),
      direction:intro.quiz?.direction===true,
      fees:intro.quiz?.fees===true,
      'intro-mastered':intro.progress?.mastered===true,
      levels:plans.length>0||later.some(s=>Number.isInteger(s.setupStep)&&s.setupStep>=1),
      risk:plans.length>0||later.some(s=>Number.isInteger(s.setupStep)&&s.setupStep>=2),
      'frozen-plan':committedPlans.length>0,
      'patient-entry':positions.some(p=>frozenPlan(p.plan)&&Number.isInteger(p.index)&&p.index>p.plan.createdIndex&&['above','below'].includes(p.plan.condition?.kind)&&p.plan.entryConditionMet===true),
      'planned-exit':later.some(s=>array(s.trades).some(t=>frozenPlan(t.plan)&&['stop','target'].includes(t.exitReason))),
      'deliberate-skip':decisions.some(d=>frozenPlan(d.plan)&&d.kind==='skipped'&&d.conditionMet===false),
      practice:practice.progress?.checked===true&&practice.feedback?.passed===true,
      independent:assessment.progress?.mastered===true&&assessment.feedback?.passed===true&&assessment.helpUsed===false,
      'leverage-basics':get('leverage').progress?.mastered===true
    };
    const previous=new Set(array(existingIds));
    const earned=catalog.filter(item=>previous.has(item.id)||proof[item.id]).map(item=>item.id);
    const newly=catalog.filter(item=>!previous.has(item.id)&&proof[item.id]);
    const xp=catalog.reduce((sum,item)=>sum+(earned.includes(item.id)?item.xp:0),0);
    let index=0;while(index+1<thresholds.length&&xp>=thresholds[index+1])index++;
    const levelStart=thresholds[index],nextLevelXP=thresholds[index+1]??null;
    return {earned,newly,xp,level:index+1,levelName:names[index],levelStart,nextLevelXP,percent:nextLevelXP===null?100:Math.round((xp-levelStart)/(nextLevelXP-levelStart)*100),completedLessons:lessonIds.filter(id=>get(id).progress?.mastered===true).length,totalLessons:lessonIds.length};
  }
  return Object.freeze({catalog,collect});
});
