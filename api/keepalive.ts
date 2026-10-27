// Daily Vercel cron (vercel.json). Supabase's free plan pauses a project after 7 days with no
// activity; one tiny query a day keeps it awake. RLS returns no rows to the anonymous key.
export async function GET() {
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) return new Response('not configured', { status: 500 })
  const res = await fetch(`${url}/rest/v1/bf_rows?select=id&limit=1`, { headers: { apikey: key } })
  return new Response(`supabase ${res.status}`, { status: res.ok ? 200 : 502 })
}
