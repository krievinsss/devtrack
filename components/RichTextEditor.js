'use client';
import { useEffect,useRef } from 'react';
import { Bold,Italic,Underline,List,ListOrdered,Quote,Code2,Link2,Minus,Heading1,Heading2,Heading3,Eraser } from 'lucide-react';

function cmd(name,value){document.execCommand(name,false,value||null)}
export default function RichTextEditor({value,onChange,placeholder='Write the assignment…'}){
  const ref=useRef(null);
  useEffect(()=>{if(ref.current&&ref.current.innerHTML!==value)ref.current.innerHTML=value||''},[value]);
  function emit(){onChange(ref.current?.innerHTML||'')}
  function block(tag){cmd('formatBlock',tag);emit()}
  function link(){const url=prompt('Link URL');if(url){cmd('createLink',url);emit()}}
  const tools=[
    [Heading1,()=>block('h1'),'H1'],[Heading2,()=>block('h2'),'H2'],[Heading3,()=>block('h3'),'H3'],
    [Bold,()=>{cmd('bold');emit()},'Bold'],[Italic,()=>{cmd('italic');emit()},'Italic'],[Underline,()=>{cmd('underline');emit()},'Underline'],
    [List,()=>{cmd('insertUnorderedList');emit()},'Bullets'],[ListOrdered,()=>{cmd('insertOrderedList');emit()},'Numbered list'],
    [Quote,()=>block('blockquote'),'Quote'],[Code2,()=>block('pre'),'Code block'],[Link2,link,'Link'],[Minus,()=>{cmd('insertHorizontalRule');emit()},'Divider'],
    [Eraser,()=>{cmd('removeFormat');emit()},'Clear formatting']
  ];
  return <div className="wysiwyg-shell"><div className="wysiwyg-toolbar">{tools.map(([Icon,fn,label],i)=><button type="button" key={i} title={label} onMouseDown={e=>{e.preventDefault();fn()}}><Icon size={15}/></button>)}</div><div ref={ref} className="wysiwyg-editor" contentEditable suppressContentEditableWarning data-placeholder={placeholder} onInput={emit}/></div>;
}
