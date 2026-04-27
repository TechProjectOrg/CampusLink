import { useRef, useState } from 'react';
import Cropper, { type Area } from 'react-easy-crop';
import { Camera, Loader2, Trash2, Upload } from 'lucide-react';
import { Button } from './button';
import { Label } from './label';
import { Modal } from './modal';
import { getCroppedImage } from '../../lib/imageCrop';

interface ClubLogoUploadProps {
  label: string;
  file: File | null;
  onFileChange: (file: File | null) => void;
  disabled?: boolean;
}

async function dataUrlToFile(dataUrl: string, fileName: string): Promise<File> {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  return new File([blob], fileName, { type: blob.type || 'image/jpeg' });
}

export function ClubLogoUpload({ label, file, onFileChange, disabled = false }: ClubLogoUploadProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [sourceImage, setSourceImage] = useState<string | null>(null);
  const [cropOpen, setCropOpen] = useState(false);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSelectFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0] ?? null;
    event.target.value = '';
    if (!selectedFile) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      setSourceImage(reader.result as string);
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setCropOpen(true);
    };
    reader.readAsDataURL(selectedFile);
  };

  const handleSaveCrop = async () => {
    if (!sourceImage || !croppedAreaPixels) return;

    setIsSaving(true);
    try {
      const croppedDataUrl = await getCroppedImage(sourceImage, croppedAreaPixels);
      const croppedFile = await dataUrlToFile(croppedDataUrl, `club-logo-${Date.now()}.jpg`);
      setPreviewUrl(croppedDataUrl);
      onFileChange(croppedFile);
      setCropOpen(false);
      setSourceImage(null);
    } catch (error) {
      console.error('Failed to crop logo:', error);
      alert(error instanceof Error ? error.message : 'Failed to crop logo');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemove = () => {
    if (disabled) return;
    setPreviewUrl(null);
    onFileChange(null);
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  };

  const hasImage = Boolean(previewUrl || file);

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleSelectFile}
        disabled={disabled}
      />

      <div
        className={`relative flex h-36 w-36 items-center justify-center overflow-hidden rounded-xl border-2 border-dashed ${
          disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:border-primary'
        }`}
        onClick={() => {
          if (!disabled) {
            inputRef.current?.click();
          }
        }}
      >
        {previewUrl ? (
          <img src={previewUrl} alt="Club logo preview" className="h-full w-full object-cover" />
        ) : (
          <div className="text-center text-gray-500">
            <Camera className="mx-auto h-6 w-6" />
            <p className="text-xs">Upload logo</p>
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={() => inputRef.current?.click()} disabled={disabled}>
          <Upload className="h-4 w-4" />
          {hasImage ? 'Change logo' : 'Add logo'}
        </Button>
        {hasImage ? (
          <Button type="button" variant="outline" className="text-red-600 hover:text-red-700" onClick={handleRemove} disabled={disabled}>
            <Trash2 className="h-4 w-4" />
            Remove
          </Button>
        ) : null}
      </div>

      <Modal
        isOpen={cropOpen}
        onClose={() => {
          if (isSaving) return;
          setCropOpen(false);
          setSourceImage(null);
        }}
        title="Crop club logo"
        style={{
          width: 'min(32rem, calc(100vw - 2rem))',
          minWidth: '22rem',
          maxWidth: 'calc(100vw - 2rem)',
        }}
      >
        <div className="space-y-3">
          <div className="relative mx-auto aspect-square w-full max-w-[21rem] overflow-hidden rounded-2xl bg-gray-950">
            {sourceImage ? (
              <Cropper
                image={sourceImage}
                crop={crop}
                zoom={zoom}
                aspect={1}
                showGrid={false}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={(_, croppedPixels) => setCroppedAreaPixels(croppedPixels)}
              />
            ) : null}
          </div>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setCropOpen(false);
                setSourceImage(null);
              }}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button type="button" onClick={() => void handleSaveCrop()} disabled={isSaving || !croppedAreaPixels}>
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {isSaving ? 'Saving...' : 'Save logo'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
