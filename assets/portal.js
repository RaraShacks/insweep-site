import {calculatePosition} from './calculator-core.mjs';
import {matchesTerm} from './search-core.mjs';

const menu=document.querySelector('#site-menu');
const menuButton=document.querySelector('.menu-toggle');
if(menu&&menuButton){
 menuButton.addEventListener('click',()=>{menu.showModal();menuButton.setAttribute('aria-expanded','true');});
 menu.querySelector('.menu-close').addEventListener('click',()=>menu.close());
 menu.addEventListener('close',()=>{menuButton.setAttribute('aria-expanded','false');menuButton.focus();});
 menu.addEventListener('click',e=>{if(e.target===menu)menu.close();});
}

const search=document.querySelector('#term-search');
if(search){
 let category='all';
 const items=[...document.querySelectorAll('[data-term]')];
 const apply=()=>{
  let shown=0;
  for(const item of items){const match=matchesTerm(item.dataset,search.value,category);item.hidden=!match;if(match)shown++;}
  document.querySelector('.search-status').textContent=`Найдено материалов: ${shown} из ${items.length}`;
  document.querySelector('.search-empty').hidden=shown>0;
 };
 search.addEventListener('input',apply);
 search.form.addEventListener('submit',e=>{e.preventDefault();apply();});
 for(const button of document.querySelectorAll('[data-filter]'))button.addEventListener('click',()=>{
  category=button.dataset.filter;
  for(const b of document.querySelectorAll('[data-filter]')){const selected=b===button;b.classList.toggle('active',selected);b.setAttribute('aria-pressed',String(selected));}
  apply();
 });
}

for(const quiz of document.querySelectorAll('[data-quiz]')){
 for(const option of quiz.querySelectorAll('[data-option]'))option.addEventListener('click',()=>{
  const correct=Number(option.dataset.option)===Number(quiz.dataset.correct);
  for(const b of quiz.querySelectorAll('[data-option]')){b.classList.toggle('selected',b===option);b.setAttribute('aria-pressed',String(b===option));}
  quiz.querySelector('.quiz-feedback').textContent=(correct?'Верно. ':'Разберёмся. ')+quiz.dataset.explanation;
 });
}

const form=document.querySelector('[data-calculator]');
if(form){
 const format=(v,max=4)=>v!==0&&Math.abs(v)<1e-8?'<0,00000001':new Intl.NumberFormat('ru-RU',{maximumFractionDigits:max===4&&Math.abs(v)<0.0001?8:max}).format(v);
 const render=()=>{
  const data=Object.fromEntries(new FormData(form));
  const result=calculatePosition(Object.fromEntries(Object.entries(data).map(([k,v])=>[k,k==='side'?v:v.trim()===''?NaN:Number(v)])));
  const error=document.querySelector('.calculator-error');
  error.hidden=result.ok;
  error.textContent=result.ok?'':result.error;
  for(const el of document.querySelectorAll('[data-result]'))el.textContent=result.ok?(el.dataset.result==='quantity'?format(result.quantity,8):format(result[el.dataset.result])+' USDT'):'—';
 };
 form.addEventListener('submit',e=>{e.preventDefault();render();});
 form.addEventListener('input',render);
 render();
}
