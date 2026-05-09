import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { decrypt, last4, isPiiKeyConfigured } from "@/lib/crypto/secret-box"
import { Form1099NEC } from "@/lib/pdf/form-1099-nec"
import { renderToBuffer } from "@react-pdf/renderer"
import { logError, logInfo } from "@/lib/log"

export const runtime = "nodejs"
export const maxDuration = 60

const SCOPE = "/api/pdf/1099"

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ subId: string; year: string }> },
) {
  const started = Date.now()
  const { subId, year: yearParam } = await params
  const year = Number.parseInt(yearParam, 10)
  if (!Number.isInteger(year) || year < 2020 || year > 2099) {
    return new Response("Invalid year", { status: 400 })
  }

  try {
    const session = await auth()
    if (!session?.user?.email) return new Response("Unauthorized", { status: 401 })
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    })
    if (!user) return new Response("Unauthorized", { status: 401 })

    if (!isPiiKeyConfigured()) {
      return new Response(
        "SUBCONTRACTOR_PII_KEY is not configured. Set it in env to enable 1099 generation.",
        { status: 503 },
      )
    }

    const sub = await prisma.subcontractor.findFirst({
      where: { id: subId, userId: user.id },
    })
    if (!sub) return new Response("Subcontractor not found", { status: 404 })
    if (sub.isCorporation) {
      return new Response(
        "This subcontractor is marked as a corporation and is not 1099-NEC eligible.",
        { status: 400 },
      )
    }

    const yearStart = new Date(Date.UTC(year, 0, 1))
    const yearEnd = new Date(Date.UTC(year + 1, 0, 1))
    const payments = await prisma.subcontractorPayment.findMany({
      where: {
        subcontractorId: subId,
        paidAt: { gte: yearStart, lt: yearEnd },
      },
      include: { project: { select: { name: true } } },
      orderBy: { paidAt: "asc" },
    })

    const total = payments.reduce((sum, p) => sum + p.amount, 0)

    // Decrypt TIN here, in this single code path. The decrypted value never
    // leaves the buffer that's about to be PDF-rendered + streamed.
    const taxIdFull = sub.taxIdEncrypted ? decrypt(sub.taxIdEncrypted) : null
    if (!taxIdFull) {
      return new Response(
        "Recipient tax ID is missing or could not be decrypted. Add it on the subcontractor's detail page first.",
        { status: 400 },
      )
    }
    const recipientLast4 = last4(taxIdFull)
    const masked = `•••-••-${recipientLast4}`

    const buffer = await renderToBuffer(
      Form1099NEC({
        taxYear: year,
        payer: {
          name: process.env.CONTRACTOR_BUSINESS_NAME ?? user.name ?? user.email,
          address: process.env.CONTRACTOR_ADDRESS ?? null,
          phone: process.env.CONTRACTOR_PHONE ?? null,
          // Payer TIN: not in the schema yet — render last4 only if present
          // in the dedicated env var. Keep this conservative.
          taxId: process.env.CONTRACTOR_TAX_ID_LAST4 ?? null,
        },
        recipient: {
          name: sub.name,
          address: sub.address,
          taxIdMasked: masked,
          taxIdFull,
        },
        amounts: {
          nonemployeeCompensation: Math.round(total * 100) / 100,
          federalTaxWithheld: 0, // Contractors don't withhold by default
          stateTaxWithheld: 0,
          stateIncome: 0,
          statePayerNumber: null,
        },
        paymentDetails: payments.map((p) => ({
          paidAt: p.paidAt,
          amount: p.amount,
          method: p.method,
          reference: p.reference,
          projectName: p.project?.name ?? null,
        })),
      }),
    )

    const safeName = sub.name.replace(/[^a-zA-Z0-9._-]/g, "_") || "subcontractor"
    logInfo(SCOPE, "Generated 1099-NEC PDF", {
      userId: user.id,
      subId,
      year,
      total,
      paymentCount: payments.length,
      bufferBytes: buffer.byteLength,
      durationMs: Date.now() - started,
    })

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="1099-NEC-${year}-${safeName}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    })
  } catch (e) {
    logError(SCOPE, e, { subId, year, durationMs: Date.now() - started })
    throw e
  }
}
