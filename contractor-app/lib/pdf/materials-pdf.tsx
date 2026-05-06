import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer"
import { formatCurrency } from "@/lib/calc"
import type { MaterialRow } from "@/lib/materials"

const styles = StyleSheet.create({
  page: {
    paddingTop: 36,
    paddingBottom: 48,
    paddingHorizontal: 36,
    fontSize: 10,
    fontFamily: "Helvetica",
    color: "#18181b",
  },
  header: {
    borderBottomWidth: 1,
    borderBottomColor: "#d97706",
    paddingBottom: 8,
    marginBottom: 16,
  },
  title: { fontSize: 18, fontWeight: 700, color: "#18181b", marginBottom: 4 },
  subtitle: { fontSize: 10, color: "#52525b" },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#f5f3ef",
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#d6d3ce",
    marginTop: 8,
  },
  tableHeaderCell: {
    fontSize: 9,
    fontWeight: 700,
    textTransform: "uppercase",
    color: "#52525b",
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
  cellRight: { fontSize: 10, textAlign: "right" },
  // Column widths (sum = 100)
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
  totalValue: { fontSize: 12, fontWeight: 700, color: "#d97706" },
  notes: {
    marginTop: 24,
    fontSize: 9,
    color: "#71717a",
    fontStyle: "italic",
  },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 36,
    right: 36,
    fontSize: 8,
    color: "#71717a",
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
    <Document
      title={`Materials — ${projectName}`}
      author="Contractor App"
    >
      <Page size="LETTER" style={styles.page} wrap>
        <View style={styles.header}>
          <Text style={styles.title}>{projectName} — Material List</Text>
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
          <Text style={{ ...styles.cell, marginTop: 12, fontStyle: "italic", color: "#71717a" }}>
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
            `Page ${pageNumber} of ${totalPages}`
          }
          fixed
        />
      </Page>
    </Document>
  )
}
