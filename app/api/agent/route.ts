import { runRequestSchema } from "@/lib/contracts";
import { loadBankSnapshot, PublicError } from "@/lib/server/nessie";
import { runAgents } from "@/lib/server/orchestrator";
export async function POST(request: Request) {
  console.log("[agent route] Request received", { openRouterConfigured: Boolean(process.env.OPENROUTER_API_KEY) });
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return Response.json({ error: "Cross-origin requests are not allowed." }, { status: 403 });
  let body;
  try {
    const text = await request.text();
    if (text.length > 250000) return Response.json({ error: "Request is too large." }, { status: 413 });
    body = runRequestSchema.safeParse(JSON.parse(text));
  } catch { return Response.json({ error: "Send a valid JSON request." }, { status: 400 }); }
  if (!body.success) return Response.json({ error: "The request or dashboard is invalid." }, { status: 400 });
  const input = body.data;
  const encoder = new TextEncoder();
  let closed = false;
  const controller = new AbortController();
  request.signal.addEventListener("abort", () => controller.abort(), { once: true });
  const stream = new ReadableStream({
    async start(output) {
      const send = (value: unknown) => { if (!closed) output.enqueue(encoder.encode(JSON.stringify(value) + "\n")); };
      try {
        send({ type: "event", event: { stage: "data", status: "running", message: "Loading the banking context." } });
        const snapshot = await loadBankSnapshot(controller.signal);
        console.log("[agent route] Banking context loaded; starting planner", { engine: snapshot.engine, mode: snapshot.mode });
        const result = await runAgents(input.prompt, input.dashboard, snapshot, event => send({ type: "event", event }), controller.signal);
        send({ type: "result", result, snapshot });
      } catch (error) {
        console.error("[agent route] Unhandled error", error);
        if (!controller.signal.aborted) send({ type: "error", error: error instanceof PublicError ? error.message : "This change could not be completed. Your dashboard was preserved." });
      } finally { if (!closed) { closed = true; output.close(); } }
    },
    cancel() { closed = true; controller.abort(); },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}
