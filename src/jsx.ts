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

// Helper components for common patterns - simplified API
export const Html = (...children: any[]) => {
  return `<html>${renderChildren(children)}</html>`;
};

export const Head = (...children: any[]) => {
  return `<head>${renderChildren(children)}</head>`;
};

export const Body = (...children: any[]) => {
  return `<body>${renderChildren(children)}</body>`;
};

export const H1 = (...children: any[]) => {
  return `<h1>${renderChildren(children)}</h1>`;
};

export const P = (...children: any[]) => {
  return `<p>${renderChildren(children)}</p>`;
};

export const Div = (...args: any[]) => {
  let options: any = null;
  let children: any[] = args;
  
  // If first arg is a plain object, treat it as options
  if (args.length > 0 && isPlainObject(args[0])) {
    options = args[0];
    children = args.slice(1);
  }
  
  const attrs = options
    ? Object.keys(options)
        .map(key => {
          if (key === 'className') return `class="${options[key]}"`;
          return `${key}="${options[key]}"`;
        })
        .join(' ')
    : '';
  
  return `<div${attrs ? ' ' + attrs : ''}>${renderChildren(children)}</div>`;
};

const isPlainObject = (obj: any): boolean => {
  return obj !== null && 
         typeof obj === 'object' && 
         !Array.isArray(obj) && 
         !(obj instanceof Date) && 
         !(obj instanceof RegExp) &&
         typeof obj !== 'string';
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
  if (typeof children === 'object') {
    const rendered = render(children);
    // Extract HTML string from Response
    return typeof rendered === 'string' ? rendered : '';
  }
  return String(children);
};