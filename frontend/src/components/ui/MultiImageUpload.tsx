import { useRef, useState } from 'react';
import { Upload, X } from 'lucide-react';
import { Button } from './button';
import { Label } from './label';
import { MAX_POST_IMAGE_BYTES, MAX_POST_IMAGES } from '../../lib/mediaUtils';

interface MultiImageUploadProps {
  files: File[];
  onFilesChange: (files: File[]) => void;
  disabled?: boolean;
  label?: string;
  maxFiles?: number;
}

export function MultiImageUpload({
  files,
  onFilesChange,
  disabled = false,
  label = 'Images (optional)',
  maxFiles = MAX_POST_IMAGES,
}: MultiImageUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const previews = files.map((file) => ({
    file,
    url: URL.createObjectURL(file),
  }));

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files ?? []);
    if (fileInputRef.current) fileInputRef.current.value = '';

    if (selected.length === 0) return;

    const next: File[] = [...files];
    for (const file of selected) {
      if (!file.type.startsWith('image/')) {
        setError('Only image files are allowed');
        continue;
      }
      if (file.size > MAX_POST_IMAGE_BYTES) {
        setError('Each image must be 10MB or smaller');
        continue;
      }
      if (next.length >= maxFiles) {
        setError(`You can upload up to ${maxFiles} images`);
        break;
      }
      if (next.some((existing) => existing.name === file.name && existing.size === file.size)) {
        continue;
      }
      next.push(file);
    }

    setError(null);
    onFilesChange(next.slice(0, maxFiles));
  };

  const removeAt = (index: number) => {
    onFilesChange(files.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Label>{label}</Label>
        <span className="text-xs text-gray-500">
          {files.length}/{maxFiles}
        </span>
      </div>

      <div
        className={`relative flex flex-col justify-center items-center w-full min-h-32 border-2 border-dashed border-gray-300 rounded-xl transition-all ${
          disabled ? 'cursor-not-allowed opacity-60' : 'hover:border-primary cursor-pointer'
        }`}
        onClick={() => {
          if (disabled || files.length >= maxFiles) return;
          fileInputRef.current?.click();
        }}
      >
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          disabled={disabled || files.length >= maxFiles}
          className="hidden"
          accept="image/*"
          multiple
        />
        <div className="text-center text-gray-500 py-4">
          <Upload className="mx-auto h-8 w-8" />
          <p>Click to add images</p>
          <p className="text-xs">PNG, JPG, GIF up to 10MB each</p>
        </div>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      {previews.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {previews.map((item, index) => (
            <div key={`${item.file.name}-${index}`} className="relative aspect-video rounded-lg overflow-hidden border">
              <img src={item.url} alt={`Preview ${index + 1}`} className="h-full w-full object-cover" />
              <Button
                type="button"
                variant="destructive"
                size="icon"
                className="absolute top-1 right-1 h-7 w-7 rounded-full"
                disabled={disabled}
                onClick={(e) => {
                  e.stopPropagation();
                  removeAt(index);
                }}
                aria-label={`Remove image ${index + 1}`}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
              <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 text-[10px] text-white">
                {index + 1}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
