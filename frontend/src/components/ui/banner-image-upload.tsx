import { useState, useRef } from 'react';
import Cropper, { type Area } from 'react-easy-crop';
import { Upload, Trash2, Edit2 } from 'lucide-react';
import { Button } from './button';
import { Modal } from './modal';
import { getCroppedImage } from '../../lib/imageCrop';
import { ButtonLoader } from './ButtonLoader';

interface BannerImageUploadProps {
  onBannerChange: (payload: { file?: File; previewUrl?: string; remove?: boolean }) => Promise<void> | void;
}

async function dataUrlToFile(dataUrl: string, fileName: string): Promise<File> {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  return new File([blob], fileName, { type: blob.type || 'image/jpeg' });
}

export function BannerImageUpload({ onBannerChange }: BannerImageUploadProps) {
  const [actionOpen, setActionOpen] = useState(false);
  const [cropOpen, setCropOpen] = useState(false);
  const [sourceImage, setSourceImage] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    e.target.value = '';

    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setSourceImage(reader.result as string);
        setCrop({ x: 0, y: 0 });
        setZoom(1);
        setCropOpen(true);
        setActionOpen(false);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSaveCrop = async () => {
    if (!sourceImage || !croppedAreaPixels) return;

    setIsSaving(true);
    try {
      const croppedImage = await getCroppedImage(sourceImage, croppedAreaPixels);
      const croppedFile = await dataUrlToFile(croppedImage, `banner-${Date.now()}.jpg`);
      await onBannerChange({ file: croppedFile, previewUrl: croppedImage });
      setCropOpen(false);
      setSourceImage(null);
    } catch (err) {
      console.error('Error saving banner image:', err);
      alert(err instanceof Error ? err.message : 'Unable to save banner image');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemoveBanner = async () => {
    const confirmed = window.confirm('Remove your banner image?');
    if (!confirmed) return;

    setIsRemoving(true);
    try {
      await onBannerChange({ remove: true });
      setActionOpen(false);
    } catch (err) {
      console.error('Error removing banner image:', err);
      alert(err instanceof Error ? err.message : 'Unable to remove banner image');
    } finally {
      setIsRemoving(false);
    }
  };

  return (
    <>
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        className="hidden"
        accept="image/*"
      />

      <Modal
        isOpen={actionOpen}
        onClose={() => setActionOpen(false)}
        title="Edit banner"
        style={{
          width: 'min(24rem, calc(100vw - 2rem))',
          minWidth: '18rem',
          maxWidth: 'calc(100vw - 2rem)',
        }}
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">Upload and crop a banner image for your profile. The image will be displayed as a background in the banner section.</p>

          <div className="space-y-2">
            <Button type="button" className="w-full" onClick={() => fileInputRef.current?.click()}>
              <Upload className="w-4 h-4" />
              Upload banner image
            </Button>

            <Button
              type="button"
              variant="outline"
              className="w-full text-red-600 hover:text-red-700"
              onClick={() => void handleRemoveBanner()}
              disabled={isRemoving}
            >
              {isRemoving ? <ButtonLoader /> : <Trash2 className="w-4 h-4" />}
              {isRemoving ? 'Removing...' : 'Remove banner'}
            </Button>

            <Button type="button" variant="ghost" className="w-full" onClick={() => setActionOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={cropOpen}
        onClose={() => {
          if (isSaving) return;
          setCropOpen(false);
          setSourceImage(null);
        }}
        title="Crop banner image"
        style={{
          width: 'min(36rem, calc(100vw - 2rem))',
          minWidth: '22rem',
          maxWidth: 'calc(100vw - 2rem)',
        }}
      >
        <div className="space-y-3">
          {/* Fill modal width and remove extra internal padding so the crop area doesn't appear shrunk */}
          <div className="relative w-full overflow-hidden rounded-2xl bg-gray-950 h-64 sm:h-80 md:h-96">
            {sourceImage && (
              <Cropper
                image={sourceImage}
                crop={crop}
                zoom={zoom}
                aspect={4} /* width:height = 4:1 so the selection height is half of previous 2:1 */
                cropShape="rect"
                showGrid={false}
                zoomWithScroll
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={(_, croppedPixels) => setCroppedAreaPixels(croppedPixels)}
              />
            )}
          </div>
          {/* Zoom via scroll only; slider removed per request */}

          <div className="space-y-2">
            <Button
              type="button"
              className="w-full"
              onClick={() => void handleSaveCrop()}
              disabled={isSaving || !croppedAreaPixels}
            >
              {isSaving ? <ButtonLoader /> : 'Save banner'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => {
                if (!isSaving) {
                  setCropOpen(false);
                  setSourceImage(null);
                }
              }}
              disabled={isSaving}
            >
              Cancel
            </Button>
          </div>
        </div>
      </Modal>

      <button
        onClick={() => setActionOpen(true)}
        className="absolute top-4 right-4 sm:top-6 sm:right-6 p-2.5 bg-white/20 hover:bg-white/30 text-white rounded-full transition-all backdrop-blur-sm z-10"
        title="Edit Banner"
      >
        <Edit2 className="w-5 h-5" />
      </button>
    </>
  );
}
