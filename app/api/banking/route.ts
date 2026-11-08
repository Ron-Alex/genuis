import { loadBankSnapshot, PublicError } from "@/lib/server/nessie";
export async function GET(request: Request) {
  try { return Response.json(await loadBankSnapshot(request.signal), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return Response.json({ error: error instanceof PublicError ? error.message : "Banking data could not be loaded." }, { status: error instanceof PublicError ? error.status : 500 }); }
}
