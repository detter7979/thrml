import { useDropzone } from "react-dropzone"

export function PhotoUploader({
  onFiles,
}: {
  onFiles: (files: File[]) => void
}) {
  const dropzone = useDropzone({
    onDrop: (files) => onFiles(files),
    accept: { "image/*": [] },
  })

  return (
    <div
      {...dropzone.getRootProps()}
      className="cursor-pointer rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground"
    >
      <input {...dropzone.getInputProps()} />
      Drag and drop listing photos, or click to browse
    </div>
  )
}
