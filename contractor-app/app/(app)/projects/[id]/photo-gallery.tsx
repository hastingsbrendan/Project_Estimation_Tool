"use client"

import Image from "next/image"
import { useRef, useState, useTransition } from "react"
import { AutoSaveForm } from "./auto-form"

export type PhotoView = {
  id: string
  url: string
  filename: string
  caption: string | null
  size: number | null
  width: number | null
  height: number | null
}

export function PhotoGallery({
  photos,
  uploadAction,
  deleteAction,
  updateCaptionAction,
}: {
  photos: PhotoView[]
  uploadAction: (formData: FormData) => Promise<{ ok: boolean; error?: string }>
  deleteAction: (photoId: string) => Promise<void>
  updateCaptionAction: (photoId: string, formData: FormData) => Promise<void>
}) {
  const [error, setError] = useState<string>("")
  const [uploading, startUpload] = useTransition()
  const fileRef = useRef<HTMLInputElement>(null)
  const [lightboxId, setLightboxId] = useState<string | null>(null)

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    setError("")
    const fd = new FormData()
    fd.append("photo", files[0])
    startUpload(async () => {
      const r = await uploadAction(fd)
      if (!r.ok) setError(r.error ?? "Upload failed")
      if (fileRef.current) fileRef.current.value = ""
    })
  }

  const lightboxPhoto = photos.find((p) => p.id === lightboxId)

  return (
    <div>
      {photos.length === 0 ? (
        <div className="text-center py-8 px-4 bg-surface border border-dashed border-border rounded-lg">
          <p className="text-sm text-foreground-muted mb-4">
            No photos yet. Snap or upload jobsite photos to keep with this project.
          </p>
          <UploadButton
            onClick={() => fileRef.current?.click()}
            uploading={uploading}
            primary
          />
        </div>
      ) : (
        <div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 mb-3">
            {photos.map((photo) => (
              <PhotoTile
                key={photo.id}
                photo={photo}
                onOpen={() => setLightboxId(photo.id)}
                onDelete={() => deleteAction(photo.id)}
              />
            ))}
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="aspect-square bg-surface border-2 border-dashed border-border rounded-lg flex flex-col items-center justify-center gap-1 text-foreground-soft hover:border-accent hover:text-accent hover:bg-accent-soft transition-colors disabled:opacity-50"
            >
              <span className="text-2xl">{uploading ? "…" : "+"}</span>
              <span className="text-xs">{uploading ? "Uploading" : "Add photo"}</span>
            </button>
          </div>
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={onFileChange}
      />

      {error && (
        <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
          {error}
        </div>
      )}

      {lightboxPhoto && (
        <Lightbox
          photo={lightboxPhoto}
          onClose={() => setLightboxId(null)}
          updateCaptionAction={updateCaptionAction}
        />
      )}
    </div>
  )
}

function PhotoTile({
  photo,
  onOpen,
  onDelete,
}: {
  photo: PhotoView
  onOpen: () => void
  onDelete: () => Promise<void>
}) {
  const [pending, startTransition] = useTransition()
  return (
    <div className="relative group aspect-square bg-surface border border-border rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={onOpen}
        className="block w-full h-full"
        title={photo.filename}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photo.url}
          alt={photo.caption ?? photo.filename}
          className="w-full h-full object-cover"
          loading="lazy"
        />
      </button>
      {photo.caption && (
        <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[10px] px-2 py-1 truncate">
          {photo.caption}
        </div>
      )}
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!confirm("Delete this photo?")) return
          startTransition(async () => {
            await onDelete()
          })
        }}
        className="absolute top-1 right-1 w-6 h-6 bg-black/60 text-white rounded-full opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-70 transition-opacity hover:bg-danger flex items-center justify-center text-xs disabled:opacity-30"
        title="Delete photo"
      >
        ✕
      </button>
    </div>
  )
}

function Lightbox({
  photo,
  onClose,
  updateCaptionAction,
}: {
  photo: PhotoView
  onClose: () => void
  updateCaptionAction: (photoId: string, formData: FormData) => Promise<void>
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      className="fixed inset-0 z-30 bg-black/80 flex items-center justify-center p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-surface rounded-lg overflow-hidden max-w-4xl w-full max-h-[90vh] flex flex-col"
      >
        <div className="bg-black flex items-center justify-center" style={{ minHeight: "60vh" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photo.url}
            alt={photo.caption ?? photo.filename}
            className="max-w-full max-h-[60vh] object-contain"
          />
        </div>
        <AutoSaveForm
          action={updateCaptionAction.bind(null, photo.id)}
          className="p-3 border-t border-border bg-surface flex items-center gap-2"
        >
          <label htmlFor="lb-caption" className="text-xs text-foreground-muted shrink-0">
            Caption:
          </label>
          <input
            id="lb-caption"
            name="caption"
            defaultValue={photo.caption ?? ""}
            placeholder="Add a caption (auto-saves)…"
            className="flex-1 text-sm border-b border-border bg-transparent focus:border-accent focus:outline-none px-1 py-0.5"
          />
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-foreground-muted hover:text-foreground px-2 py-1"
          >
            Close
          </button>
        </AutoSaveForm>
      </div>
    </div>
  )
}

function UploadButton({
  onClick,
  uploading,
  primary,
}: {
  onClick: () => void
  uploading: boolean
  primary?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={uploading}
      className={
        primary
          ? "px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-hover disabled:opacity-50"
          : "px-3 py-1.5 bg-surface border border-border text-foreground rounded text-xs font-medium hover:bg-accent-soft disabled:opacity-50"
      }
    >
      {uploading ? "Uploading…" : "+ Upload photo"}
    </button>
  )
}
