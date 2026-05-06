import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer"
import { calcEstimate, formatCurrency } from "@/lib/calc"

const styles = StyleSheet.create({
  page: {
    paddingTop: 48,
    paddingBottom: 48,
    paddingHorizontal: 48,
    fontSize: 10.5,
    fontFamily: "Helvetica",
    color: "#18181b",
    lineHeight: 1.4,
  },
  // Cover
  cover: {
    paddingTop: 80,
    paddingBottom: 40,
    borderBottomWidth: 4,
    borderBottomColor: "#d97706",
    marginBottom: 24,
  },
  brand: { fontSize: 11, color: "#d97706", fontWeight: 700, letterSpacing: 1, marginBottom: 24 },
  projectName: { fontSize: 28, fontWeight: 700, color: "#18181b", marginBottom: 8, lineHeight: 1.2 },
  subline: { fontSize: 12, color: "#52525b" },
  // Sections
  sectionHeading: {
    fontSize: 13,
    fontWeight: 700,
    color: "#18181b",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginTop: 18,
    marginBottom: 8,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#d6d3ce",
  },
  paragraph: { marginBottom: 6 },
  metaGrid: { flexDirection: "row", flexWrap: "wrap", marginBottom: 12, gap: 0 },
  metaItem: { width: "50%", marginBottom: 8 },
  metaLabel: { fontSize: 9, color: "#71717a", textTransform: "uppercase", letterSpacing: 0.5 },
  metaValue: { fontSize: 11, color: "#18181b", marginTop: 2 },
  // Estimate table
  table: { marginTop: 8 },
  tHeader: {
    flexDirection: "row",
    backgroundColor: "#f5f3ef",
    paddingVertical: 5,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#d6d3ce",
  },
  tHeaderCell: {
    fontSize: 9,
    fontWeight: 700,
    color: "#52525b",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  sectionRow: {
    flexDirection: "row",
    paddingTop: 8,
    paddingBottom: 4,
    paddingHorizontal: 4,
  },
  sectionRowName: { fontSize: 11, fontWeight: 700, color: "#18181b", flex: 1 },
  sectionRowTotal: { fontSize: 11, fontWeight: 700, color: "#18181b", textAlign: "right", width: 80 },
  liRow: {
    flexDirection: "row",
    paddingVertical: 3,
    paddingHorizontal: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: "#e7e5e0",
  },
  liDesc: { width: "60%", paddingRight: 6, fontSize: 10 },
  liQty: { width: "10%", textAlign: "right", fontSize: 10 },
  liUnit: { width: "10%", fontSize: 10, color: "#52525b" },
  liTotal: { width: "20%", textAlign: "right", fontSize: 10 },
  // Totals box
  totalsBox: {
    marginTop: 24,
    paddingTop: 12,
    borderTopWidth: 2,
    borderTopColor: "#18181b",
  },
  totalRow: { flexDirection: "row", justifyContent: "flex-end", marginBottom: 4 },
  totalLabel: { fontSize: 10, color: "#52525b", marginRight: 12, width: 140, textAlign: "right" },
  totalValue: { fontSize: 10, color: "#18181b", width: 90, textAlign: "right" },
  grandRow: { flexDirection: "row", justifyContent: "flex-end", marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: "#18181b" },
  grandLabel: { fontSize: 12, fontWeight: 700, color: "#18181b", marginRight: 12, width: 140, textAlign: "right" },
  grandValue: { fontSize: 14, fontWeight: 700, color: "#d97706", width: 90, textAlign: "right" },
  // Footer
  footer: {
    position: "absolute",
    bottom: 24,
    left: 48,
    right: 48,
    fontSize: 8,
    color: "#71717a",
    textAlign: "center",
  },
  // Acceptance line
  acceptBlock: {
    marginTop: 28,
    padding: 12,
    borderWidth: 1,
    borderColor: "#d6d3ce",
    borderRadius: 4,
  },
  acceptHeading: { fontSize: 11, fontWeight: 700, marginBottom: 8 },
  acceptLine: { flexDirection: "row", marginTop: 24 },
  acceptSig: {
    width: "60%",
    paddingRight: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#18181b",
    paddingBottom: 2,
    fontSize: 9,
    color: "#71717a",
  },
  acceptDate: {
    width: "40%",
    borderBottomWidth: 1,
    borderBottomColor: "#18181b",
    paddingBottom: 2,
    fontSize: 9,
    color: "#71717a",
  },
})

type SectionForPdf = {
  name: string
  lineItems: Array<{
    description: string
    quantity: number
    unit: string
    unitPrice: number
    kind: string
  }>
}

export function ProposalPdf({
  project,
  sections,
  generatedAt,
}: {
  project: {
    name: string
    clientName: string | null
    clientEmail: string | null
    address: string | null
    scope: string | null
    exclusions: string | null
    paymentSchedule: string | null
    markupPct: number
    taxRate: number
  }
  sections: SectionForPdf[]
  generatedAt: Date
}) {
  const allLineItems = sections.flatMap((s) =>
    s.lineItems.map((li) => ({
      quantity: li.quantity,
      unitPrice: li.unitPrice,
      kind: li.kind as "material" | "labor",
    })),
  )
  const totals = calcEstimate({
    lineItems: allLineItems,
    markupPct: project.markupPct,
    taxRate: project.taxRate,
  })

  return (
    <Document title={`Proposal — ${project.name}`} author="Contractor App">
      <Page size="LETTER" style={styles.page} wrap>
        <View style={styles.cover}>
          <Text style={styles.brand}>PROPOSAL</Text>
          <Text style={styles.projectName}>{project.name}</Text>
          <Text style={styles.subline}>
            {project.clientName ? `Prepared for ${project.clientName}` : "Prepared for client"}
            {"  ·  "}
            {generatedAt.toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </Text>
        </View>

        <View style={styles.metaGrid}>
          {project.clientName && (
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>Client</Text>
              <Text style={styles.metaValue}>{project.clientName}</Text>
            </View>
          )}
          {project.clientEmail && (
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>Email</Text>
              <Text style={styles.metaValue}>{project.clientEmail}</Text>
            </View>
          )}
          {project.address && (
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>Job site</Text>
              <Text style={styles.metaValue}>{project.address}</Text>
            </View>
          )}
        </View>

        {project.scope && (
          <>
            <Text style={styles.sectionHeading}>Scope of work</Text>
            <Text style={styles.paragraph}>{project.scope}</Text>
          </>
        )}

        <Text style={styles.sectionHeading}>Estimate breakdown</Text>
        <View style={styles.table}>
          <View style={styles.tHeader} fixed>
            <Text style={[styles.tHeaderCell, { width: "60%" }]}>Description</Text>
            <Text style={[styles.tHeaderCell, { width: "10%", textAlign: "right" }]}>Qty</Text>
            <Text style={[styles.tHeaderCell, { width: "10%" }]}>Unit</Text>
            <Text style={[styles.tHeaderCell, { width: "20%", textAlign: "right" }]}>Total</Text>
          </View>
          {sections.map((section, sIdx) => {
            const sectionTotal = section.lineItems.reduce(
              (sum, li) => sum + li.quantity * li.unitPrice,
              0,
            )
            return (
              <View key={sIdx} wrap={false}>
                <View style={styles.sectionRow}>
                  <Text style={styles.sectionRowName}>{section.name}</Text>
                  <Text style={styles.sectionRowTotal}>{formatCurrency(sectionTotal)}</Text>
                </View>
                {section.lineItems.map((li, lIdx) => (
                  <View key={lIdx} style={styles.liRow}>
                    <Text style={styles.liDesc}>{li.description}</Text>
                    <Text style={styles.liQty}>{li.quantity}</Text>
                    <Text style={styles.liUnit}>{li.unit}</Text>
                    <Text style={styles.liTotal}>
                      {formatCurrency(li.quantity * li.unitPrice)}
                    </Text>
                  </View>
                ))}
              </View>
            )
          })}
        </View>

        <View style={styles.totalsBox}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Materials</Text>
            <Text style={styles.totalValue}>{formatCurrency(totals.materialSubtotal)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Labor</Text>
            <Text style={styles.totalValue}>{formatCurrency(totals.laborSubtotal)}</Text>
          </View>
          {project.markupPct > 0 && (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Markup ({project.markupPct}%)</Text>
              <Text style={styles.totalValue}>{formatCurrency(totals.markup)}</Text>
            </View>
          )}
          {project.taxRate > 0 && (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Sales tax ({project.taxRate}%)</Text>
              <Text style={styles.totalValue}>{formatCurrency(totals.tax)}</Text>
            </View>
          )}
          <View style={styles.grandRow}>
            <Text style={styles.grandLabel}>Total</Text>
            <Text style={styles.grandValue}>{formatCurrency(totals.total)}</Text>
          </View>
        </View>

        {project.exclusions && (
          <>
            <Text style={styles.sectionHeading}>Exclusions</Text>
            <Text style={styles.paragraph}>{project.exclusions}</Text>
          </>
        )}

        {project.paymentSchedule && (
          <>
            <Text style={styles.sectionHeading}>Payment schedule</Text>
            <Text style={styles.paragraph}>{project.paymentSchedule}</Text>
          </>
        )}

        <View style={styles.acceptBlock} wrap={false}>
          <Text style={styles.acceptHeading}>Acceptance</Text>
          <Text style={{ fontSize: 9, color: "#52525b" }}>
            By signing below, the client accepts the scope of work, total price, and
            payment schedule above. Any changes to the scope require a written change
            order signed by both parties.
          </Text>
          <View style={styles.acceptLine}>
            <Text style={styles.acceptSig}>Client signature</Text>
            <Text style={styles.acceptDate}>Date</Text>
          </View>
        </View>

        <Text
          style={styles.footer}
          render={({ pageNumber, totalPages }) =>
            `${project.name}  ·  Page ${pageNumber} of ${totalPages}`
          }
          fixed
        />
      </Page>
    </Document>
  )
}
