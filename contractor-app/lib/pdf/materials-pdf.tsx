import { Document, Page, Text, View, Image, StyleSheet } from "@react-pdf/renderer"
import { formatCurrency } from "@/lib/calc"
import type { MaterialRow } from "@/lib/materials"
import { BRAND, LOGO } from "./branding"

const styles = StyleSheet.create({
  page: {
    paddingTop: 36,
    paddingBottom: 48,
    paddingHorizontal: 36,
    fontSize: 10,
    fontFamily: "Helvetica",
    color: "#18181b",
  },
  // Top brand bar
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
  // Header
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
  // Table
  tableHeader: {
    flexDirection: "row",
    backgroundColor: BRAND.surfaceMutedHex,
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: BRAND.borderHex,
    marginTop: 8,
  },
  tableHeaderCell: {
    fontSize: 9,
    fontWeight: 700,
    textTransform: "uppercase",
    color: BRAND.mutedHex,
    letterSpacing: 0.5,
  },
  row: {
    flexDirection: "row",
    paddingVertical: 5,
    paddingHorizontal: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: "#e7e5e0",
  },
  cell: { fontSize: 10 },
  colDesc: { width: "50%", paddingRight: 6 },
  colQty: { width: "12%", textAlign: "right" },
  colUnit: { width: "10%" },
  colPrice: { width: "14%", textAlign: "right" },
  colSubtotal: { width: "14%", textAlign: "right" },
  totalsRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 16,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#18181b",
  },
  totalLabel: { fontSize: 11, fontWeight: 700, marginRight: 12 },
  totalValue: { fontSize: 12, fontWeight: 700, color: BRAND.accentHex },
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

export function MaterialsPdf({
  projectName,
  clientName,
  generatedAt,
  rows,
  total,
}: {
  projectName: string
  clientName: string | null
  generatedAt: Date
  rows: MaterialRow[]
  total: number
}) {
  return (
    <Document title={`Materials — ${projectName}`} author={BRAND.name}>
      <Page size="LETTER" style={styles.page} wrap>
        <View style={styles.brandBar}>
          {LOGO ? (
            <Image src={LOGO} style={styles.logo} />
          ) : (
            <Text style={{ ...styles.brandName, fontSize: 14 }}>{BRAND.name}</Text>
          )}
          <View style={styles.brandTextBlock}>
            <Text style={styles.brandName}>{BRAND.name.toUpperCase()}</Text>
            {BRAND.tagline ? <Text style={styles.brandTag}>{BRAND.tagline}</Text> : null}
          </View>
        </View>

        <View style={styles.header}>
          <Text style={styles.ribbon}>MATERIAL LIST</Text>
          <Text style={styles.title}>{projectName}</Text>
          <Text style={styles.subtitle}>
            {clientName ? `Client: ${clientName}  ·  ` : ""}
            Generated {generatedAt.toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </Text>
        </View>

        <View style={styles.tableHeader} fixed>
          <Text style={[styles.tableHeaderCell, styles.colDesc]}>Description</Text>
          <Text style={[styles.tableHeaderCell, styles.colQty]}>Qty</Text>
          <Text style={[styles.tableHeaderCell, styles.colUnit]}>Unit</Text>
          <Text style={[styles.tableHeaderCell, styles.colPrice]}>Est $/unit</Text>
          <Text style={[styles.tableHeaderCell, styles.colSubtotal]}>Subtotal</Text>
        </View>

        {rows.length === 0 ? (
          <Text style={{ ...styles.cell, marginTop: 12, fontStyle: "italic", color: BRAND.softHex }}>
            No material line items in this project yet.
          </Text>
        ) : (
          rows.map((r, i) => (
            <View key={i} style={styles.row} wrap={false}>
              <Text style={[styles.cell, styles.colDesc]}>{r.description}</Text>
              <Text style={[styles.cell, styles.colQty]}>{r.quantity}</Text>
              <Text style={[styles.cell, styles.colUnit]}>{r.unit}</Text>
              <Text style={[styles.cell, styles.colPrice]}>{formatCurrency(r.estUnitPrice)}</Text>
              <Text style={[styles.cell, styles.colSubtotal]}>{formatCurrency(r.estSubtotal)}</Text>
            </View>
          ))
        )}

        {rows.length > 0 && (
          <View style={styles.totalsRow}>
            <Text style={styles.totalLabel}>Estimated material total</Text>
            <Text style={styles.totalValue}>{formatCurrency(total)}</Text>
          </View>
        )}

        <Text style={styles.notes} fixed>
          Estimated prices are from the contractor&apos;s catalog at the time of generation.
          Actual prices may vary at the supplier; verify before purchase.
        </Text>

        <Text
          style={styles.footer}
          render={({ pageNumber, totalPages }) =>
            `${BRAND.name}  ·  Page ${pageNumber} of ${totalPages}`
          }
          fixed
        />
      </Page>
    </Document>
  )
}
