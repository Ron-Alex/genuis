import { build, transform } from "esbuild";
import { PublicError } from "./nessie";

export function validateComponent(source: string) {
  if (!/function\s+GeneratedWidget\s*\(/.test(source)) throw new Error("Define function GeneratedWidget({ data }).");
  if (/\b(import|export|require|fetch|XMLHttpRequest|WebSocket|eval|Function|window|document|parent|top|location|navigator|localStorage|sessionStorage|Worker|globalThis)\b|dangerouslySetInnerHTML/.test(source) || /<\s*(script|iframe|object|embed|form|a)\b|\b(src|href)\s*=/i.test(source)) {
    throw new Error("Generated widgets may only use React, inline styles, data props, and local state. Remove imports, browser globals, network calls, navigation, and raw HTML.");
  }
}

export async function checkComponent(source: string) {
  validateComponent(source);
  await transform(source, { loader: "tsx", jsx: "transform", target: "es2020" });
}

// This bundles code without executing it. Execution occurs only in the opaque-origin iframe.
export async function bundleComponent(source: string): Promise<string> {
  await checkComponent(source);
  const entry = `import * as React from 'react'; import { createRoot } from 'react-dom/client';
const { useState, useMemo, useEffect, useRef, useCallback } = React;
${source}
class Boundary extends React.Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { parent.postMessage({ type: 'genuis-widget-error', token: window.__TOKEN__ }, '*'); }
  render() { return this.state.failed ? React.createElement('p', null, 'This widget could not render.') : this.props.children; }
}
function Root() {
  React.useEffect(() => { parent.postMessage({ type: 'genuis-widget-ready', token: window.__TOKEN__ }, '*'); }, []);
  return React.createElement(GeneratedWidget, { data: window.__DATA__ });
}
try { createRoot(document.getElementById('root')).render(React.createElement(Boundary, null, React.createElement(Root))); }
catch { parent.postMessage({ type: 'genuis-widget-error', token: window.__TOKEN__ }, '*'); }`;
  try {
    const result = await build({
      stdin: { contents: entry, loader: "tsx", resolveDir: process.cwd() },
      bundle: true, write: false, platform: "browser", format: "iife", target: "es2020",
      define: { "process.env.NODE_ENV": '"production"' }, minify: true, logLevel: "silent",
    });
    return result.outputFiles[0].text;
  } catch { throw new PublicError("The generated component could not be compiled.", 422); }
}
