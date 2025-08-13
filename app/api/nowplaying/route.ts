import { NextResponse } from "next/server"
export const dynamic = "force-dynamic"

const HOST = "sonicpanel.oficialserver.com"
const PORT = 8342

function splitTitle(raw: string) {
  const t = (raw || "").trim()
  if (!t || /autodj|auto dj|radio/i.test(t)) return ["AutoDJ", "Tocando as melhores!"]
  if (t.includes(" - ")) {
    const [a, b] = t.split(" - ", 2)
    return [a?.trim() || "AutoDJ", b?.trim() || "Tocando as melhores!"]
  }
  return ["AutoDJ", t]
}

async function getText(url: string) {
  const r = await fetch(url, { cache: "no-store" })
  if (!r.ok) throw new Error(String(r.status))
  return { text: await r.text(), ct: r.headers.get("content-type") || "" }
}

export async function GET() {
  const baseH = `http://${HOST}:${PORT}`
  const baseS = `https://${HOST}:${PORT}`

  // 1) JSON-ish
  const jsonCandidates = [
    `${baseS}/stats?json=1`,
    `${baseH}/stats?json=1`,
    `${baseS}/status-json.xsl`,
    `${baseH}/status-json.xsl`,
    `${baseS}/statistics?json=1`,
    `${baseH}/statistics?json=1`,
  ]
  for (const u of jsonCandidates) {
    try {
      const { text, ct } = await getText(u)
      const looksJson = /json|x-javascript|javascript/i.test(ct) || text.trim().startsWith("{")
      if (!looksJson) continue
      const d = JSON.parse(text)

      const listeners =
        Number(
          d?.currentlisteners ??
            d?.listeners ??
            d?.servertype?.listeners ??
            d?.icestats?.source?.listeners ??
            d?.icestats?.listeners ??
            0,
        ) || 0

      const title = d?.songtitle ?? d?.title ?? d?.streamtitle ?? d?.icestats?.source?.title ?? d?.icestats?.title ?? ""

      const [locutor, programa] = splitTitle(String(title || ""))
      const resp = NextResponse.json({ locutor, programa, ouvintes: listeners })
      resp.headers.set("Cache-Control", "s-maxage=10, stale-while-revalidate=30")
      resp.headers.set("Access-Control-Allow-Origin", "*")
      return resp
    } catch {}
  }

  // 2) 7.html - testando HTTP e HTTPS, com e sem ?sid=1
  const htmlCandidates = [`${baseS}/7.html`, `${baseH}/7.html`, `${baseS}/7.html?sid=1`, `${baseH}/7.html?sid=1`]

  for (const u of htmlCandidates) {
    try {
      const { text } = await getText(u)
      // Remover tags HTML
      const plain = text.replace(/<[^>]+>/g, "").trim()
      // Separar campos por vírgula e limpar espaços
      const parts = plain.split(",").map((s) => s.trim())

      // Verificar se parts.length >= 8 e parts[0] começa com OK
      if (parts.length >= 8 && /^ok/i.test(parts[0])) {
        // Definir current e unique
        const current = Number(parts[1]) || 0
        const unique = Number(parts[4]) || 0

        // Priorizar ouvintes únicos
        const listeners = unique > 0 ? unique : current

        // Extrair título
        const title = parts[parts.length - 1] || ""
        const [locutor, programa] = splitTitle(title)

        const resp = NextResponse.json({ locutor, programa, ouvintes: listeners })
        resp.headers.set("Cache-Control", "s-maxage=10, stale-while-revalidate=30")
        resp.headers.set("Access-Control-Allow-Origin", "*")
        return resp
      }
    } catch {}
  }

  // 3) Fallback
  const resp = NextResponse.json({
    locutor: "AutoDJ",
    programa: "Tocando as melhores!",
    ouvintes: 0,
    stale: true,
  })
  resp.headers.set("Cache-Control", "s-maxage=5, stale-while-revalidate=30")
  resp.headers.set("Access-Control-Allow-Origin", "*")
  return resp
}
