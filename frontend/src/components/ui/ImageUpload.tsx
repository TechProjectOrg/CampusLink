import { useState, useRef } from 'react';
import { Upload, Image, X } from 'lucide-react';
import { Button } from './button';
import { Label } from './label';

interface ImageUploadProps {
  onFileChange: (file: File | null) => void;
}

export function ImageUpload({ onFileChange }: ImageUploadProps) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0] || null;
    setFile(selectedFile);
    onFileChange(selectedFile);

    if (selectedFile) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreview(reader.result as string);
      };
      reader.readAsDataURL(selectedFile);
    } else {
      setPreview(null);
    }
  };

  const handleRemoveImage = () => {
    setFile(null);
    setPreview(null);
    onFileChange(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-2">
      <Label>Cover Image (optional)</Label>
      <div
        className="relative flex justify-center items-center w-full h-48 border-2 border-dashed border-gray-300 rounded-xl hover:border-primary transition-all cursor-pointer"
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          className="hidden"
          accept="image/*"
        />
        {preview ? (
          <>
            <img src={preview} alt="Preview" className="w-full h-full object-cover rounded-xl" />
            <Button
              type="button"
              variant="destructive"
              size="icon"
              className="absolute top-2 right-2 rounded-full h-8 w-8"
              onClick={(e) => {
                e.stopPropagation();
                handleRemoveImage();
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          </>
        ) : (
          <div className="text-center text-gray-500">
            <Upload className="mx-auto h-8 w-8" />
            <p>Click to upload an image</p>
            <p className="text-xs">PNG, JPG, GIF up to 10MB</p>
          </div>
        )}
      </div>
    </div>
  );
}
