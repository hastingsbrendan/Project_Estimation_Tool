"use client"

import {
  DndContext,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { restrictToVerticalAxis, restrictToParentElement } from "@dnd-kit/modifiers"
import { CSS } from "@dnd-kit/utilities"
import { useEffect, useState, useTransition, type ReactNode } from "react"

/**
 * Vertical drag-and-drop list. Children are server-rendered ReactNode trees,
 * each wrapped in <DraggableRow id="..."> matching one of `ids`. On drop,
 * calls the server action with the new id order. Optimistic local state
 * keeps the UI smooth while the server roundtrips.
 */
export function SortableList({
  ids,
  onReorder,
  children,
  className,
}: {
  ids: string[]
  onReorder: (orderedIds: string[]) => Promise<void>
  children: ReactNode
  className?: string
}) {
  const [order, setOrder] = useState(ids)
  const [pending, startTransition] = useTransition()

  // Re-sync if the server sends a different list (revalidate after an add/delete).
  useEffect(() => {
    if (
      ids.length !== order.length ||
      ids.some((id, i) => id !== order[i])
    ) {
      setOrder(ids)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids.join("|")])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const a = String(active.id)
    const b = String(over.id)
    const oldIndex = order.indexOf(a)
    const newIndex = order.indexOf(b)
    if (oldIndex < 0 || newIndex < 0) return

    const next = arrayMove(order, oldIndex, newIndex)
    const prev = order
    setOrder(next)
    startTransition(async () => {
      try {
        await onReorder(next)
      } catch {
        setOrder(prev)
      }
    })
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
      modifiers={[restrictToVerticalAxis, restrictToParentElement]}
    >
      <SortableContext items={order} strategy={verticalListSortingStrategy}>
        <div
          className={`${className ?? ""} ${pending ? "opacity-95" : ""} transition-opacity`}
        >
          {children}
        </div>
      </SortableContext>
    </DndContext>
  )
}

/**
 * Wraps server-rendered children with drag-handle behavior. Renders the
 * handle as a small ⋮⋮ glyph on the left, hidden until hover/focus on
 * desktop and always-visible on touch.
 */
export function DraggableRow({
  id,
  children,
  className,
  handlePosition = "leading",
}: {
  id: string
  children: ReactNode
  className?: string
  /** "leading" (left of row) or "absolute" (positioned outside left edge). */
  handlePosition?: "leading" | "absolute"
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.7 : 1,
    zIndex: isDragging ? 50 : "auto",
    position: "relative" as const,
  }

  if (handlePosition === "absolute") {
    return (
      <div ref={setNodeRef} style={style} className={`group ${className ?? ""}`}>
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label="Drag to reorder"
          title="Drag to reorder"
          onMouseDown={(e) => e.preventDefault()}
          className="absolute -left-5 top-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing touch-none w-5 h-8 flex items-center justify-center text-foreground-soft hover:text-foreground opacity-0 group-hover:opacity-100 sm:opacity-0 sm:group-hover:opacity-100 [@media(hover:none)]:opacity-60 transition-opacity"
        >
          <span aria-hidden="true" className="text-sm leading-none select-none">⋮⋮</span>
        </button>
        {children}
      </div>
    )
  }

  return (
    <div ref={setNodeRef} style={style} className={`flex items-stretch ${className ?? ""}`}>
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label="Drag to reorder"
        title="Drag to reorder"
        onMouseDown={(e) => e.preventDefault()}
        className="cursor-grab active:cursor-grabbing touch-none w-5 flex items-center justify-center text-foreground-soft hover:text-foreground shrink-0"
      >
        <span aria-hidden="true" className="text-xs leading-none select-none">⋮⋮</span>
      </button>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  )
}
