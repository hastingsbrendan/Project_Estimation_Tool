import { Document, Page, Text, View, Image, StyleSheet } from "@react-pdf/renderer"
import { formatCurrency } from "@/lib/calc"
import { BRAND, LOGO } from "./branding"

/**
 * Milestone invoice — one page, one amount due. Follows the visual
 * conventions of materials-pdf.tsx / proposal-pdf.tsx (brand bar,
 * accent header ribbon, Helvetica).
 *
 * Deliberately simple: an invoice for a payment milestone is "amount
 * due against the accepted estimate", not an itemized re-bill of line
 * items — the proposal already itemized the work.
 */

const styles = StyleSheet.create({
  page: {
    paddingTop: 36,
    paddingBottom: 48,
    paddingHorizontal: 36,
    fontSize: 10,
    fontFamily: "Helvetica",
    color: "#18181b",
  },
  brandBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  logo: { width: 56, height: 56, objectFit: "contain" },
  brandTextBlock: { textAlign: "right" },
  brandName: { fontSize: 12, fontWeight: 700, color: BRAND.accentHex, letterSpacing: 1 },
  brandTag: { fontSize: 8, color: BRAND.softHex, marginTop: 2 },
  header: {
    borderTopWidth: 3,
    borderTopColor: BRAND.accentHex,
    borderBottomWidth: 1,
    borderBottomColor: BRAND.borderHex,
    paddingVertical: 10,
    marginBottom: 16,
  },
  ribbon: { fontSize: 9, color: BRAND.accentHex, fontWeight: 700, letterSpacing: 2, marginBottom: 4 },
  title: { fontSize: 16, fontWeight: 700, color: "#18181b", marginBottom: 2 },
  subtitle: { fontSize: 10, color: BRAND.mutedHex },
  metaGrid: { flexDirection: "row", gap: 24, marginBottom: 20 },
  metaBlock: { flexGrow: 1 },
  metaLabel: {
    fontSize: 8,
    fontWeight: 700,
    textTransform: "uppercase",
    color: BRAND.softHex,
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  metaValue: { fontSize: 10, color: "#18181b" },
  // The "amount due" block
  dueBox: {
    backgroundColor: BRAND.surfaceMutedHex,
    borderWidth: 1,
    borderColor: BRAND.borderHex,
    borderRadius: 4,
    padding: 16,
    marginBottom: 16,
  },
  dueRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
  },
  dueLabel: { fontSize: 11, fontWeight: 700 },
  dueValue: { fontSize: 20, fontWeight: 700, color: BRAND.accentHex },
  scheduleHeader: {
    fontSize: 9,
    fontWeight: 700,
    textTransform: "uppercase",
    color: BRAND.mutedHex,
    letterSpacing: 0.5,
    marginBottom: 6,
    marginTop: 8,
  },
  scheduleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
    paddingHorizontal: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: "#e7e5e0",
  },
  schedulePaid: { color: BRAND.softHex },
  scheduleCurrent: { fontWeight: 700 },
  notes: { marginTop: 24, fontSize: 9, color: BRAND.softHex, fontStyle: "italic" },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 36,
    right: 36,
    fontSize: 8,
    color: BRAND.softHex,
    textAlign: "center",
  },
})

export type InvoiceScheduleRow = {
  label: string
  amount: number
  paid: boolean
  current: boolean
}

export function InvoicePdf({
  invoiceNumber,
  projectName,
  clientName,
  address,
  milestoneLabel,
  amount,
  issuedAt,
  schedule,
  projectTotal,
}: {
  invoiceNumber: string
  projectName: string
  clientName: string | null
  address: string | null
  milestoneLabel: string
  amount: number
  issuedAt: Date
  /** Full milestone schedule for context — shows where this bill sits. */
  schedule: InvoiceScheduleRow[]
  projectTotal: number
}) {
  return (
    <Document
      title={`Invoice ${invoiceNumber} — ${projectName}`}
      author={BRAND.name}
    >
      <Page size="LETTER" style={styles.page}>
        <View style={styles.brandBar}>
          {LOGO ? <Image src={LOGO} style={styles.logo} /> : <View />}
          <View style={styles.brandTextBlock}>
            <Text style={styles.brandName}>{BRAND.name.toUpperCase()}</Text>
            {BRAND.tagline ? <Text style={styles.brandTag}>{BRAND.tagline}</Text> : null}
          </View>
        </View>

        <View style={styles.header}>
          <Text style={styles.ribbon}>INVOICE {invoiceNumber}</Text>
          <Text style={styles.title}>{projectName}</Text>
          <Text style={styles.subtitle}>
            Issued {issuedAt.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
          </Text>
        </View>

        <View style={styles.metaGrid}>
          <View style={styles.metaBlock}>
            <Text style={styles.metaLabel}>Billed to</Text>
            <Text style={styles.metaValue}>{clientName ?? "—"}</Text>
            {address ? <Text style={styles.metaValue}>{address}</Text> : null}
          </View>
          <View style={styles.metaBlock}>
            <Text style={styles.metaLabel}>Contract total</Text>
            <Text style={styles.metaValue}>{formatCurrency(projectTotal)}</Text>
          </View>
        </View>

        <View style={styles.dueBox}>
          <View style={styles.dueRow}>
            <Text style={styles.dueLabel}>Amount due — {milestoneLabel}</Text>
            <Text style={styles.dueValue}>{formatCurrency(amount)}</Text>
          </View>
        </View>

        <Text style={styles.scheduleHeader}>Payment schedule</Text>
        {schedule.map((row, i) => (
          <View key={i} style={styles.scheduleRow}>
            <Text
              style={[
                row.paid ? styles.schedulePaid : {},
                row.current ? styles.scheduleCurrent : {},
              ]}
            >
              {row.paid ? "✓ " : row.current ? "→ " : "  "}
              {row.label}
            </Text>
            <Text
              style={[
                row.paid ? styles.schedulePaid : {},
                row.current ? styles.scheduleCurrent : {},
              ]}
            >
              {formatCurrency(row.amount)}
            </Text>
          </View>
        ))}

        <Text style={styles.notes}>
          Make checks payable to {BRAND.name}. Questions about this invoice? Just
          reply to the email it came with.
        </Text>

        <Text style={styles.footer} fixed>
          {BRAND.name} · Invoice {invoiceNumber} · {projectName}
        </Text>
      </Page>
    </Document>
  )
}
