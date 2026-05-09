/* eslint-disable jsx-a11y/alt-text */
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
} from "@react-pdf/renderer"

/**
 * 1099-NEC three-copy PDF — Copy B (Recipient), Copy C (Payer), Copy 2
 * (State / local). Copy A is intentionally NOT generated here — it must
 * go through IRS FIRE / Track1099 / Tax1099.com per the OUTROS_PLAN.md
 * note. The IRS prints Copy A on red drop-out ink that consumer printers
 * can't reproduce; you'd be filing a non-compliant form if you tried.
 *
 * Layout note: this is NOT the official IRS form image. It's a
 * substitute-style summary that the recipient can keep for their records
 * and the payer can file with state if state filing is required. Always
 * stamp "SUBSTITUTE — NOT FOR FEDERAL FILING" on every copy so it can't
 * be confused with an official IRS-printed form.
 */

Font.register({
  family: "Helvetica",
  fonts: [
    { src: "Helvetica", fontWeight: "normal" },
    { src: "Helvetica-Bold", fontWeight: "bold" },
  ],
})

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 9,
    padding: 36,
    backgroundColor: "#ffffff",
    color: "#000000",
  },
  copyHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginBottom: 8,
    paddingBottom: 6,
    borderBottom: "2pt solid #000",
  },
  formTitle: {
    fontSize: 14,
    fontWeight: "bold",
  },
  copyLabel: {
    fontSize: 11,
    fontWeight: "bold",
    color: "#a00",
  },
  copyDescription: {
    fontSize: 8,
    color: "#444",
    fontStyle: "italic",
  },
  substituteWarning: {
    backgroundColor: "#fff8e1",
    borderColor: "#a00",
    borderWidth: 1,
    padding: 6,
    fontSize: 8,
    fontWeight: "bold",
    color: "#a00",
    marginBottom: 12,
    textAlign: "center",
  },
  partiesGrid: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  party: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#000",
    padding: 6,
  },
  partyLabel: {
    fontSize: 7,
    color: "#444",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  partyValue: {
    fontSize: 10,
    marginTop: 1,
  },
  partyValueBold: {
    fontSize: 10,
    fontWeight: "bold",
    marginTop: 1,
  },
  taxIdRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  taxIdBox: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#000",
    padding: 6,
  },
  amountBoxes: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 12,
  },
  amountBox: {
    width: "48%",
    borderWidth: 1,
    borderColor: "#000",
    padding: 6,
  },
  amountLabel: {
    fontSize: 7,
    color: "#444",
    textTransform: "uppercase",
  },
  amountValue: {
    fontSize: 14,
    fontWeight: "bold",
    marginTop: 2,
    fontFamily: "Helvetica",
  },
  amountValueZero: {
    fontSize: 14,
    color: "#888",
    marginTop: 2,
  },
  recipientNote: {
    fontSize: 7,
    color: "#444",
    marginTop: 12,
    lineHeight: 1.4,
  },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 36,
    right: 36,
    fontSize: 7,
    color: "#666",
    textAlign: "center",
    paddingTop: 6,
    borderTop: "1pt solid #ccc",
  },
})

export type Form1099Data = {
  taxYear: number
  payer: {
    name: string
    address: string | null
    phone: string | null
    taxId: string | null // last4 only — never include full payer EIN unless certain
  }
  recipient: {
    name: string
    address: string | null
    taxIdMasked: string // "•••-••-1234" or "••-•••1234" depending on SSN/EIN
    taxIdFull: string | null // 9-digit, optional — included only if caller decides
  }
  amounts: {
    nonemployeeCompensation: number // Box 1
    federalTaxWithheld: number // Box 4
    stateTaxWithheld: number // Box 5
    stateIncome: number // Box 7
    statePayerNumber: string | null // Box 6
  }
  // Internal — list of payments rolled up into the totals so the PDF can
  // print a payment ledger as supporting detail (helpful when the recipient
  // queries the total).
  paymentDetails: Array<{
    paidAt: Date
    amount: number
    method: string
    reference: string | null
    projectName: string | null
  }>
}

const COPIES: Array<{
  code: "B" | "C" | "2"
  title: string
  description: string
}> = [
  {
    code: "B",
    title: "Copy B",
    description: "For Recipient — keep for your records",
  },
  {
    code: "C",
    title: "Copy C",
    description: "For Payer — keep with your tax records",
  },
  {
    code: "2",
    title: "Copy 2",
    description: "To be filed with recipient's state income tax return when required",
  },
]

function fmtMoney(n: number): string {
  if (n === 0) return "—"
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  })
}

export function Form1099NEC(data: Form1099Data) {
  return (
    <Document
      title={`1099-NEC ${data.taxYear} — ${data.recipient.name}`}
      author={data.payer.name}
    >
      {COPIES.map((copy) => (
        <Page key={copy.code} size="LETTER" style={styles.page}>
          <View style={styles.copyHeader}>
            <View>
              <Text style={styles.formTitle}>
                Form 1099-NEC ({data.taxYear})
              </Text>
              <Text style={{ fontSize: 8 }}>Nonemployee Compensation</Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={styles.copyLabel}>{copy.title}</Text>
              <Text style={styles.copyDescription}>{copy.description}</Text>
            </View>
          </View>

          <View style={styles.substituteWarning}>
            <Text>
              SUBSTITUTE FORM — NOT FOR FEDERAL FILING. File the official
              Copy A through IRS FIRE, Track1099, or Tax1099.com.
            </Text>
          </View>

          <View style={styles.partiesGrid}>
            <View style={styles.party}>
              <Text style={styles.partyLabel}>Payer</Text>
              <Text style={styles.partyValueBold}>{data.payer.name}</Text>
              {data.payer.address && (
                <Text style={styles.partyValue}>{data.payer.address}</Text>
              )}
              {data.payer.phone && (
                <Text style={styles.partyValue}>{data.payer.phone}</Text>
              )}
            </View>

            <View style={styles.party}>
              <Text style={styles.partyLabel}>Recipient</Text>
              <Text style={styles.partyValueBold}>{data.recipient.name}</Text>
              {data.recipient.address && (
                <Text style={styles.partyValue}>{data.recipient.address}</Text>
              )}
            </View>
          </View>

          <View style={styles.taxIdRow}>
            <View style={styles.taxIdBox}>
              <Text style={styles.partyLabel}>Payer's TIN</Text>
              <Text style={styles.partyValueBold}>
                {data.payer.taxId ? `••• •• ${data.payer.taxId}` : "Not on file"}
              </Text>
            </View>
            <View style={styles.taxIdBox}>
              <Text style={styles.partyLabel}>Recipient's TIN</Text>
              <Text style={styles.partyValueBold}>
                {/* For the recipient's copy (B), show full TIN. For payer/state, mask. */}
                {copy.code === "B" && data.recipient.taxIdFull
                  ? formatTin(data.recipient.taxIdFull)
                  : data.recipient.taxIdMasked}
              </Text>
            </View>
          </View>

          <View style={styles.amountBoxes}>
            <View style={styles.amountBox}>
              <Text style={styles.amountLabel}>
                Box 1 — Nonemployee compensation
              </Text>
              <Text
                style={
                  data.amounts.nonemployeeCompensation > 0
                    ? styles.amountValue
                    : styles.amountValueZero
                }
              >
                {fmtMoney(data.amounts.nonemployeeCompensation)}
              </Text>
            </View>

            <View style={styles.amountBox}>
              <Text style={styles.amountLabel}>
                Box 4 — Federal income tax withheld
              </Text>
              <Text
                style={
                  data.amounts.federalTaxWithheld > 0
                    ? styles.amountValue
                    : styles.amountValueZero
                }
              >
                {fmtMoney(data.amounts.federalTaxWithheld)}
              </Text>
            </View>

            <View style={styles.amountBox}>
              <Text style={styles.amountLabel}>
                Box 5 — State tax withheld
              </Text>
              <Text
                style={
                  data.amounts.stateTaxWithheld > 0
                    ? styles.amountValue
                    : styles.amountValueZero
                }
              >
                {fmtMoney(data.amounts.stateTaxWithheld)}
              </Text>
            </View>

            <View style={styles.amountBox}>
              <Text style={styles.amountLabel}>Box 7 — State income</Text>
              <Text
                style={
                  data.amounts.stateIncome > 0
                    ? styles.amountValue
                    : styles.amountValueZero
                }
              >
                {fmtMoney(data.amounts.stateIncome)}
              </Text>
            </View>
          </View>

          {data.paymentDetails.length > 0 && (
            <View
              style={{
                borderWidth: 1,
                borderColor: "#000",
                padding: 6,
              }}
            >
              <Text
                style={{
                  fontSize: 8,
                  fontWeight: "bold",
                  marginBottom: 4,
                }}
              >
                Payment ledger ({data.paymentDetails.length} entries)
              </Text>
              {data.paymentDetails.slice(0, 16).map((p, i) => (
                <View
                  key={i}
                  style={{
                    flexDirection: "row",
                    fontSize: 8,
                    paddingVertical: 1,
                    borderBottom: "0.5pt solid #ddd",
                  }}
                >
                  <Text style={{ width: 70 }}>
                    {p.paidAt.toLocaleDateString("en-US")}
                  </Text>
                  <Text style={{ width: 50, textTransform: "capitalize" }}>
                    {p.method}
                  </Text>
                  <Text style={{ flex: 1 }}>
                    {p.projectName ?? "(unassigned)"}
                    {p.reference ? ` · ${p.reference}` : ""}
                  </Text>
                  <Text style={{ width: 70, textAlign: "right" }}>
                    {fmtMoney(p.amount)}
                  </Text>
                </View>
              ))}
              {data.paymentDetails.length > 16 && (
                <Text style={{ fontSize: 7, color: "#666", marginTop: 4 }}>
                  + {data.paymentDetails.length - 16} more payments not shown
                </Text>
              )}
            </View>
          )}

          {copy.code === "B" && (
            <Text style={styles.recipientNote}>
              <Text style={{ fontWeight: "bold" }}>For the recipient: </Text>
              This amount is reportable as self-employment income. Consult
              your tax professional for state filing requirements. Box 1
              amounts of $400 or more are generally subject to
              self-employment tax (Schedule SE).
            </Text>
          )}

          <Text style={styles.footer}>
            Generated by {data.payer.name}'s contractor app on{" "}
            {new Date().toLocaleDateString("en-US", { dateStyle: "long" })} ·
            Tax year {data.taxYear}
          </Text>
        </Page>
      ))}
    </Document>
  )
}

function formatTin(digits: string): string {
  const d = digits.replace(/\D/g, "")
  if (d.length !== 9) return digits
  // Heuristic: SSNs are XXX-XX-XXXX, EINs are XX-XXXXXXX. We don't track
  // which type the contractor entered, so fall back to SSN format on Copy
  // B where the recipient sees their own TIN (they'll know if it's wrong).
  return `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}`
}
