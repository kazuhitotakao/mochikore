export const runtime = "nodejs";

export async function GET() {
  const baseUrl = process.env.LARAVEL_API_BASE_URL;
  if (!baseUrl) {
    return Response.json({ ok: false }, { status: 503 });
  }

  try {
    const response = await fetch(`${baseUrl}/up`, {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });

    return Response.json(
      { ok: response.ok },
      { status: response.ok ? 200 : 502 },
    );
  } catch {
    return Response.json({ ok: false }, { status: 502 });
  }
}
