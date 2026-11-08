"use client";
import { useEffect, useRef, useState } from "react";
import type { QueryResult } from "@/lib/contracts";

const compiled = new Map<string, Promise<string>>();
function getBundle(code: string) {
  if (!compiled.has(code)) {
    const promise = fetch("/api/component", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }), signal: AbortSignal.timeout(20000) }).then(async response => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Compilation failed.");
      return result.script as string;
    }).catch(error => { compiled.delete(code); throw error; });
    compiled.set(code, promise);
    if (compiled.size > 20) compiled.delete(compiled.keys().next().value!);
  }
  return compiled.get(code)!;
}
export function GeneratedWidget({ code, data, onReady, onError }: { code: string; data: QueryResult; onReady?: () => void; onError?: (message: string) => void }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const callbacks = useRef({ onReady, onError });
  callbacks.current = { onReady, onError };
  const [documentHTML, setDocumentHTML] = useState("");
  const [error, setError] = useState("");
  const serialized = JSON.stringify(data);
  useEffect(() => {
    setError("");
    setDocumentHTML("");
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const token = crypto.randomUUID(), nonce = crypto.randomUUID().replaceAll("-", "");
    const reportError = () => {
      if (!active) return;
      const message = "The generated widget failed its browser preview. Your previous dashboard is intact.";
      setError(message); callbacks.current.onError?.(message);
    };
    const listener = (event: MessageEvent) => {
      if (!active || event.source !== frame.current?.contentWindow || event.data?.token !== token) return;
      if (event.data.type === "genuis-widget-error") { clearTimeout(timer); reportError(); }
      if (event.data.type === "genuis-widget-ready") { clearTimeout(timer); callbacks.current.onReady?.(); }
    };
    window.addEventListener("message", listener);
    getBundle(code).then(script => {
      if (!active) return;
      const boot = `window.__TOKEN__=${JSON.stringify(token)};window.__DATA__=${serialized.replace(/</g, "\\u003c")};`;
      const safeScript = (boot + script).replace(/<\/script/gi, "<\\/script");
      setDocumentHTML(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'"><style>body{margin:0;color:#292631;background:#fff;font:14px system-ui,sans-serif}*{box-sizing:border-box}button,input,select{font:inherit}button{cursor:pointer}</style></head><body><div id="root"></div><script nonce="${nonce}">${safeScript}</script></body></html>`);
      timer = setTimeout(reportError, 15000);
    }).catch(reportError);
    return () => { active = false; clearTimeout(timer); window.removeEventListener("message", listener); };
  }, [code, serialized]);
  if (error) return <p className="inline-error">{error}</p>;
  return <iframe ref={frame} srcDoc={documentHTML || undefined} sandbox="allow-scripts" title="Generated banking widget preview" className="generated-frame" referrerPolicy="no-referrer" />;
}
