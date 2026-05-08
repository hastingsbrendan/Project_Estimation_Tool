"use client"

import { useState } from "react"
import { AddLineItemForm, type CatalogPickerItem } from "./catalog-picker"
import { SuggestedMaterialsPanel, type SuggestedPreset } from "./suggested-materials-panel"
import type { AddLineItemError, AddLineItemResult } from "./actions"

/**
 * Composes the services-only picker with the inline suggestion panel.
 * After a successful service add that returns presets, surface the panel
 * directly below the picker. Materials picker is the bare form.
 */
export function ServicesPicker({
  catalog,
  addAction,
  applyPresetsAction,
}: {
  catalog: CatalogPickerItem[]
  addAction: (formData: FormData) => Promise<AddLineItemResult | AddLineItemError>
  applyPresetsAction: (
    picks: Array<{ presetId: string; quantity: number }>,
  ) => Promise<{ added: number }>
}) {
  const [pending, setPending] = useState<{
    description: string
    presets: SuggestedPreset[]
  } | null>(null)

  return (
    <>
      <AddLineItemForm
        action={addAction}
        catalog={catalog}
        lockKind="labor"
        buttonLabel="Add"
        onAfterAdd={(result) => {
          if (result.suggestedPresets.length > 0) {
            setPending({
              description: result.description,
              presets: result.suggestedPresets,
            })
          }
        }}
      />
      {pending && (
        <SuggestedMaterialsPanel
          serviceDescription={pending.description}
          presets={pending.presets}
          onApply={applyPresetsAction}
          onDismiss={() => setPending(null)}
        />
      )}
    </>
  )
}
