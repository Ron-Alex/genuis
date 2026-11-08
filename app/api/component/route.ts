import { z } from "zod";
import { bundleComponent } from "@/lib/server/components";
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return Response.json({ error: "Cross-origin requests are not allowed." }, { status: 403 });
  try {
    const text = await request.text();
    if (text.length > 25000) return Response.json({ error: "Component is too large." }, { status: 413 });
    const input = z.object({ code: z.string().min(1).max(18000) }).parse(JSON.parse(text));
    const script = await bundleComponent(input.code);
    return Response.json({ script }, { headers: { "Cache-Control": "no-store" } });
  } catch { return Response.json({ error: "This component could not be compiled. Try regenerating it." }, { status: 422 }); }
}
