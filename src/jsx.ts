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
export const Html = (props: JSXProps) => jsx('html', props);
export const Head = (props: JSXProps) => jsx('head', props);
export const Body = (props: JSXProps) => jsx('body', props);
export const Title = (props: JSXProps) => jsx('title', props);
export const Div = (props: JSXProps) => jsx('div', props);
export const Span = (props: JSXProps) => jsx('span', props);
export const P = (props: JSXProps) => jsx('p', props);
export const A = (props: JSXProps) => jsx('a', props);
export const Button = (props: JSXProps) => jsx('button', props);
export const Input = (props: JSXProps) => jsx('input', { ...props, children: undefined });
export const Form = (props: JSXProps) => jsx('form', props);
export const H1 = (props: JSXProps) => jsx('h1', props);
export const H2 = (props: JSXProps) => jsx('h2', props);
export const H3 = (props: JSXProps) => jsx('h3', props);
export const Ul = (props: JSXProps) => jsx('ul', props);
export const Li = (props: JSXProps) => jsx('li', props);

// Response helper for JSX
export const render = (jsxContent: any) => {
  const html = typeof jsxContent === 'string' ? jsxContent : String(jsxContent);
  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  });
};