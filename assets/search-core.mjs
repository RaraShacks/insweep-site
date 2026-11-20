const normalize=value=>String(value??'').toLocaleLowerCase('ru').replaceAll('ё','е').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
export const searchText=article=>[article.title,...article.terms,...(article.aliases||[]),article.summary].join(' ');
export function matchesTerm(item,query,category='all'){
 const words=normalize(query).split(/\s+/).filter(Boolean);
 const text=normalize(item.search);
 return (category==='all'||item.category===category)&&words.every(word=>text.includes(word));
}
