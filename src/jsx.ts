// princejs/jsx.ts - Optional JSX SSR
export interface JSXProps {
  children?: any;
  [key: string]: any;
}

export const jsx = (tag: string | Function, props: JSXProps, ...children: any[]): any => {
  if (typeof tag === 'function') {
    return tag({ ...props, children });
  }

  // Handle HTML elements
  const attrs = Object.entries(props || {})
    .filter(([key]) => key !== 'children')
    .map(([key, value]) => ` ${key}="${String(value).replace(/"/g, '&quot;')}"`)
    .join('');

  const content = children.flat().filter(Boolean).join('');
  
  return `<${tag}${attrs}>${content}</${tag}>`;
};

export const jsxs = jsx;
export const jsxDEV = jsx;
export const Fragment = (props: JSXProps) => props.children;

// Helper components for common patterns
// In your JSX implementation
export const Html = (props: any) => {
  return `<html>${renderChildren(props.children)}</html>`;
};

export const Head = (props: any) => {
  return `<head>${renderChildren(props.children)}</head>`;
};

export const Body = (props: any) => {
  return `<body>${renderChildren(props.children)}</body>`;
};

export const H1 = (props: any) => {
  return `<h1>${renderChildren(props.children)}</h1>`;
};

export const P = (props: any) => {
  return `<p>${renderChildren(props.children)}</p>`;
};

export const Div = (props: any) => {
  const attrs = Object.keys(props)
    .filter(key => key !== 'children')
    .map(key => {
      if (key === 'className') return `class="${props[key]}"`;
      return `${key}="${props[key]}"`;
    })
    .join(' ');
  
  return `<div ${attrs}>${renderChildren(props.children)}</div>`;
};


// Response helper for JSX
export const render = (jsxContent: any) => {
  const html = typeof jsxContent === 'string' ? jsxContent : String(jsxContent);
  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  });
};

const renderChildren = (children: any): string => {
  if (!children) return '';
  if (Array.isArray(children)) return children.map(renderChildren).join('');
  if (typeof children === 'object') return render(children);
  return String(children);
};