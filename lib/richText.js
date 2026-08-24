const ALLOWED=new Set(['p','br','h1','h2','h3','strong','b','em','i','u','ul','ol','li','blockquote','pre','code','a','hr']);
export function sanitizeRichText(html=''){
  let out=String(html).replace(/<!--[\s\S]*?-->/g,'').replace(/<(script|style|iframe|object|embed|svg|math)[^>]*>[\s\S]*?<\/\1>/gi,'');
  out=out.replace(/<\/?([a-z0-9]+)([^>]*)>/gi,(m,tag,attrs)=>{
    tag=tag.toLowerCase();if(!ALLOWED.has(tag))return '';
    if(m.startsWith('</'))return `</${tag}>`;
    if(tag==='a'){
      const match=attrs.match(/href\s*=\s*["']([^"']+)["']/i);const href=match?.[1]||'';
      if(!/^https?:\/\//i.test(href)&&!/^mailto:/i.test(href))return '<a>';
      return `<a href="${href.replace(/["<>]/g,'')}" target="_blank" rel="noreferrer">`;
    }
    return tag==='br'?'<br>':tag==='hr'?'<hr>':`<${tag}>`;
  });
  return out.replace(/\son\w+\s*=\s*["'][^"']*["']/gi,'').replace(/\sstyle\s*=\s*["'][^"']*["']/gi,'');
}
export function richTextToPlain(html=''){
  return sanitizeRichText(html).replace(/<br\s*\/?>/gi,'\n').replace(/<\/(p|h1|h2|h3|li|blockquote|pre)>/gi,'\n').replace(/<[^>]+>/g,'').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/\n{3,}/g,'\n\n').trim();
}
