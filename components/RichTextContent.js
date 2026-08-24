export default function RichTextContent({html,fallback}){
  if(html)return <div className="rich-content" dangerouslySetInnerHTML={{__html:html}}/>;
  return <div className="rich-content"><p>{fallback||'No assignment description.'}</p></div>;
}
