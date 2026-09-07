// princejs/jsx.ts - JSX SSR runtime with typed HTML helpers
/// <reference types="bun-types" />

// ── Types ────────────────────────────────────────────────────────────────────

export interface BaseProps {
  id?: string;
  class?: string;
  style?: string;
  children?: any;
  title?: string;
  hidden?: boolean;
  tabIndex?: number;
  role?: string;
  onclick?: string;
  onsubmit?: string;
  onchange?: string;
  onload?: string;
  onerror?: string;
  onfocus?: string;
  onblur?: string;
  [key: `data-${string}`]: string | number | boolean | undefined;
  [key: `aria-${string}`]: string | number | boolean | undefined;
}

export interface HtmlProps extends BaseProps { lang?: string; dir?: string; }
export interface HeadProps extends BaseProps {}
export interface BodyProps extends BaseProps { onload?: string; onerror?: string; }
export interface TitleProps extends BaseProps {}
export interface MetaProps extends BaseProps { charset?: string; name?: string; content?: string; property?: string; httpEquiv?: string; }
export interface LinkProps extends BaseProps { rel?: string; href?: string; type?: string; media?: string; sizes?: string; }
export interface StyleProps extends BaseProps { type?: string; }
export interface ScriptProps extends BaseProps { src?: string; type?: string; defer?: boolean; async?: boolean; }
export interface AnchorProps extends BaseProps { href?: string; target?: string; rel?: string; download?: string; }
export interface DivProps extends BaseProps {}
export interface SpanProps extends BaseProps {}
export interface ParagraphProps extends BaseProps {}
export interface HeadingProps extends BaseProps {}
export interface FormProps extends BaseProps { action?: string; method?: string; enctype?: string; novalidate?: boolean; }
export interface InputProps extends BaseProps { type?: string; name?: string; value?: string | number; placeholder?: string; required?: boolean; disabled?: boolean; checked?: boolean; min?: number | string; max?: number | string; step?: number | string; pattern?: string; autocomplete?: string; autofocus?: boolean; multiple?: boolean; }
export interface ButtonProps extends BaseProps { type?: string; disabled?: boolean; name?: string; value?: string; }
export interface TextareaProps extends BaseProps { name?: string; placeholder?: string; rows?: number; cols?: number; required?: boolean; disabled?: boolean; maxlength?: number; minlength?: number; }
export interface SelectProps extends BaseProps { name?: string; required?: boolean; disabled?: boolean; multiple?: boolean; size?: number; }
export interface OptionProps extends BaseProps { value?: string | number; selected?: boolean; disabled?: boolean; label?: string; }
export interface ImgProps extends BaseProps { src?: string; alt?: string; width?: number; height?: number; loading?: 'lazy' | 'eager'; decoding?: 'sync' | 'async' | 'auto'; }
export interface AnchorProps extends BaseProps { href?: string; target?: string; rel?: string; download?: string; }
export interface NavProps extends BaseProps {}
export interface FooterProps extends BaseProps {}
export interface HeaderProps extends BaseProps {}
export interface SectionProps extends BaseProps {}
export interface ArticleProps extends BaseProps {}
export interface MainProps extends BaseProps {}
export interface AsideProps extends BaseProps {}
export interface UlProps extends BaseProps {}
export interface OlProps extends BaseProps { start?: number; reversed?: boolean; }
export interface LiProps extends BaseProps { value?: number; }
export interface H1Props extends HeadingProps {}
export interface H2Props extends HeadingProps {}
export interface H3Props extends HeadingProps {}
export interface H4Props extends HeadingProps {}
export interface H5Props extends HeadingProps {}
export interface H6Props extends HeadingProps {}

// ── Utilities ────────────────────────────────────────────────────────────────

const isPlainObject = (obj: any): boolean =>
  obj !== null && typeof obj === 'object' && !Array.isArray(obj)
  && !(obj instanceof Date) && !(obj instanceof RegExp) && typeof obj !== 'string';

function normalizeArgs(args: any[]): { props: Record<string, any>; children: any[] } {
  if (args.length === 0) return { props: {}, children: [] };

  if (args.length === 1 && isPlainObject(args[0])) {
    const { children, ...props } = args[0];
    return {
      props,
      children: children !== undefined ? (Array.isArray(children) ? children : [children]) : [],
    };
  }

  if (isPlainObject(args[0])) {
    const { children: existingChildren, ...props } = args[0];
    const rest = args.slice(1);
    const extracted = existingChildren !== undefined
      ? (Array.isArray(existingChildren) ? existingChildren : [existingChildren])
      : [];
    return { props, children: [...extracted, ...rest] };
  }

  return { props: {}, children: args };
}

const ATTR_MAP: Record<string, string> = {
  className: 'class', htmlFor: 'for', tabIndex: 'tabindex',
  onClick: 'onclick', onChange: 'onchange', onSubmit: 'onsubmit',
  onLoad: 'onload', onError: 'onerror', onFocus: 'onfocus', onBlur: 'onblur',
  httpEquiv: 'http-equiv',
};

const VOID_ELEMENTS = new Set([
  'area','base','br','col','embed','hr','img','input',
  'link','meta','param','source','track','wbr',
]);

const BOOLEAN_ATTRS = new Set([
  'required','disabled','checked','hidden','readonly','autofocus',
  'autoplay','controls','loop','muted','multiple','open','selected',
  'defer','async','novalidate','reversed','async',
]);

function buildAttrs(props: Record<string, any>): string {
  return Object.entries(props)
    .filter(([, v]) => v !== false && v !== null && v !== undefined)
    .map(([key, value]) => {
      const attr = ATTR_MAP[key] ?? key;
      if (value === true) return BOOLEAN_ATTRS.has(attr) ? ` ${attr}` : ` ${attr}="${attr}"`;
      if (typeof value === 'string') return ` ${attr}="${value.replace(/"/g, '&quot;')}"`;
      if (typeof value === 'number') return ` ${attr}="${value}"`;
      return '';
    })
    .filter(Boolean)
    .join('');
}

const renderChildren = (children: any): string => {
  if (!children) return '';
  if (Array.isArray(children)) return children.map(renderChildren).join('');
  if (typeof children === 'function') {
    const out = (children as () => any)();
    if (out == null) return '';
    return typeof out === 'string' ? out : JSON.stringify(out);
  }
  if (typeof children === 'object') return JSON.stringify(children);
  return String(children);
};

// ── JSX Runtime ──────────────────────────────────────────────────────────────

export const jsx = (tag: string | Function, props: Record<string, any>, ...children: any[]): any => {
  if (typeof tag === 'function') {
    return tag({ ...props, children });
  }

  const { children: propChildren, ...rest } = props || {};
  const allChildren = [...(propChildren !== undefined ? (Array.isArray(propChildren) ? propChildren : [propChildren]) : []), ...children];
  const attrs = buildAttrs(rest);
  const content = allChildren.flat().filter(Boolean).map((c) => typeof c === 'string' ? c : JSON.stringify(c)).join('');

  if (VOID_ELEMENTS.has(tag)) {
    return content ? `<${tag}${attrs}>${content}` : `<${tag}${attrs}>`;
  }

  return `<${tag}${attrs}>${content}</${tag}>`;
};

export const jsxs = jsx;
export const jsxDEV = jsx;
export const Fragment = (props: { children?: any }) => props.children;

// ── Helper Components ────────────────────────────────────────────────────────
// Each works both as JSX: <Html>...</Html>
// And as direct calls: Html(child1, child2)

export const Html = (...args: any[]) => {
  const { props, children } = normalizeArgs(args);
  const attrs = buildAttrs(props);
  return `<html${attrs}>${renderChildren(children)}</html>`;
};

export const Head = (...args: any[]) => {
  const { props, children } = normalizeArgs(args);
  const attrs = buildAttrs(props);
  return `<head${attrs}>${renderChildren(children)}</head>`;
};

export const Body = (...args: any[]) => {
  const { props, children } = normalizeArgs(args);
  const attrs = buildAttrs(props);
  return `<body${attrs}>${renderChildren(children)}</body>`;
};

export const Title = (...args: any[]) => {
  const { props, children } = normalizeArgs(args);
  return `<title>${renderChildren(children)}</title>`;
};

export const Meta = (...args: any[]) => {
  const { props } = normalizeArgs(args);
  return `<meta${buildAttrs(props)}>`;
};

export const Link = (...args: any[]) => {
  const { props } = normalizeArgs(args);
  return `<link${buildAttrs(props)}>`;
};

export const Style = (...args: any[]) => {
  const { props, children } = normalizeArgs(args);
  return `<style${buildAttrs(props)}>${renderChildren(children)}</style>`;
};

export const Script = (...args: any[]) => {
  const { props, children } = normalizeArgs(args);
  const attrs = buildAttrs(props);
  if (!children && props.src) return `<script${attrs}></script>`;
  return `<script${attrs}>${renderChildren(children)}</script>`;
};

export const Div = (...args: any[]) => {
  const { props, children } = normalizeArgs(args);
  return `<div${buildAttrs(props)}>${renderChildren(children)}</div>`;
};

export const Span = (...args: any[]) => {
  const { props, children } = normalizeArgs(args);
  return `<span${buildAttrs(props)}>${renderChildren(children)}</span>`;
};

export const P = (...args: any[]) => {
  const { props, children } = normalizeArgs(args);
  return `<p${buildAttrs(props)}>${renderChildren(children)}</p>`;
};

export const A = (...args: any[]) => {
  const { props, children } = normalizeArgs(args);
  return `<a${buildAttrs(props)}>${renderChildren(children)}</a>`;
};

export const Img = (...args: any[]) => {
  const { props } = normalizeArgs(args);
  return `<img${buildAttrs(props)}>`;
};

export const H1 = (...args: any[]) => {
  const { props, children } = normalizeArgs(args);
  return `<h1${buildAttrs(props)}>${renderChildren(children)}</h1>`;
};

export const H2 = (...args: any[]) => {
  const { props, children } = normalizeArgs(args);
  return `<h2${buildAttrs(props)}>${renderChildren(children)}</h2>`;
};

export const H3 = (...args: any[]) => {
  const { props, children } = normalizeArgs(args);
  return `<h3${buildAttrs(props)}>${renderChildren(children)}</h3>`;
};

export const H4 = (...args: any[]) => {
  const { props, children } = normalizeArgs(args);
  return `<h4${buildAttrs(props)}>${renderChildren(children)}</h4>`;
};

export const H5 = (...args: any[]) => {
  const { props, children } = normalizeArgs(args);
  return `<h5${buildAttrs(props)}>${renderChildren(children)}</h5>`;
};

export const H6 = (...args: any[]) => {
  const { props, children } = normalizeArgs(args);
  return `<h6${buildAttrs(props)}>${renderChildren(children)}</h6>`;
};

export const Form = (...args: any[]) => {
  const { props, children } = normalizeArgs(args);
  return `<form${buildAttrs(props)}>${renderChildren(children)}</form>`;
};

export const Input = (...args: any[]) => {
  const { props } = normalizeArgs(args);
  return `<input${buildAttrs(props)}>`;
};

export const Button = (...args: any[]) => {
  const { props, children } = normalizeArgs(args);
  return `<button${buildAttrs(props)}>${renderChildren(children)}</button>`;
};

export const Textarea = (...args: any[]) => {
  const { props, children } = normalizeArgs(args);
  return `<textarea${buildAttrs(props)}>${renderChildren(children)}</textarea>`;
};

export const Select = (...args: any[]) => {
  const { props, children } = normalizeArgs(args);
  return `<select${buildAttrs(props)}>${renderChildren(children)}</select>`;
};

export const Option = (...args: any[]) => {
  const { props, children } = normalizeArgs(args);
  return `<option${buildAttrs(props)}>${renderChildren(children)}</option>`;
};

export const Nav = (...args: any[]) => {
  const { props, children } = normalizeArgs(args);
  return `<nav${buildAttrs(props)}>${renderChildren(children)}</nav>`;
};

export const Header = (...args: any[]) => {
  const { props, children } = normalizeArgs(args);
  return `<header${buildAttrs(props)}>${renderChildren(children)}</header>`;
};

export const Footer = (...args: any[]) => {
  const { props, children } = normalizeArgs(args);
  return `<footer${buildAttrs(props)}>${renderChildren(children)}</footer>`;
};

export const Main = (...args: any[]) => {
  const { props, children } = normalizeArgs(args);
  return `<main${buildAttrs(props)}>${renderChildren(children)}</main>`;
};

export const Section = (...args: any[]) => {
  const { props, children } = normalizeArgs(args);
  return `<section${buildAttrs(props)}>${renderChildren(children)}</section>`;
};

export const Article = (...args: any[]) => {
  const { props, children } = normalizeArgs(args);
  return `<article${buildAttrs(props)}>${renderChildren(children)}</article>`;
};

export const Aside = (...args: any[]) => {
  const { props, children } = normalizeArgs(args);
  return `<aside${buildAttrs(props)}>${renderChildren(children)}</aside>`;
};

export const Ul = (...args: any[]) => {
  const { props, children } = normalizeArgs(args);
  return `<ul${buildAttrs(props)}>${renderChildren(children)}</ul>`;
};

export const Ol = (...args: any[]) => {
  const { props, children } = normalizeArgs(args);
  return `<ol${buildAttrs(props)}>${renderChildren(children)}</ol>`;
};

export const Li = (...args: any[]) => {
  const { props, children } = normalizeArgs(args);
  return `<li${buildAttrs(props)}>${renderChildren(children)}</li>`;
};

export const Br = () => '<br>';
export const Hr = () => '<hr>';

// ── Render Helpers ───────────────────────────────────────────────────────────

export const render = (content: any) => {
  const html = typeof content === 'string' ? content : String(content);
  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
};

export const renderPage = (content: any, status = 200) => {
  const html = typeof content === 'string' ? content : String(content);
  return new Response(html, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
};

// ── Layout Pattern ───────────────────────────────────────────────────────────
// Layouts are just functions that compose pages. No special API needed.
//
// const BaseLayout = (data: { title: string; children: any }) =>
//   Html(
//     Head(Title(data.title), Meta({ charset: "utf-8" })),
//     Body(Div({ class: "container" }, data.children))
//   );
//
// app.get("/", (req) => render(
//   BaseLayout({ title: "Home", children: P("Hello world") })
// ));
//
// For shared partials, just write functions:
// const navbar = () => Nav(A({ href: "/" }, "Home"), A({ href: "/about" }, "About"));
// const footer = () => Footer(P("Built with PrinceJS"));
