import { useEffect, useRef, useState } from 'react';
import Cropper, { type Area } from 'react-easy-crop';
import { Camera, Loader2, Upload, User, Trash2 } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from './avatar';
import { Button } from './button';
import { Modal } from './modal';
import { getCroppedImage } from '../../lib/imageCrop';

interface ProfilePhotoUploadProps {
  currentPhoto?: string;
  name: string;
  hasCustomPhoto: boolean;
  onPhotoChange: (photoUrl: string | null) => Promise<void> | void;
  size?: 'sm' | 'md' | 'lg';
  editable?: boolean;
}

export function ProfilePhotoUpload({
  currentPhoto,
  name,
  hasCustomPhoto,
  onPhotoChange,
  size = 'lg',
  editable = true,
}: ProfilePhotoUploadProps) {
  const [actionOpen, setActionOpen] = useState(false);
  const [cropOpen, setCropOpen] = useState(false);
  const [sourceImage, setSourceImage] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [localPhoto, setLocalPhoto] = useState<string | null | undefined>(undefined);
  const [isHovering, setIsHovering] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const sizeClasses = {
    sm: 'w-16 h-16',
    md: 'w-24 h-24',
    lg: 'w-32 h-32',
  };

  const iconSizes = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6',
  };

  useEffect(() => {
    setLocalPhoto(undefined);
  }, [currentPhoto]);

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

  const displayImage = localPhoto !== undefined ? localPhoto : currentPhoto;

  const handleSaveCrop = async () => {
    if (!sourceImage || !croppedAreaPixels) return;

    setIsSaving(true);
    try {
      const croppedImage = await getCroppedImage(sourceImage, croppedAreaPixels);
      setLocalPhoto(croppedImage);
      await onPhotoChange(croppedImage);
      setCropOpen(false);
      setSourceImage(null);
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemovePhoto = async () => {
    const confirmed = window.confirm('Remove your profile picture?');
    if (!confirmed) return;

    setIsRemoving(true);
    try {
      setLocalPhoto(null);
      await onPhotoChange(null);
      setActionOpen(false);
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

      <div
        className={`relative ${sizeClasses[size]} rounded-full cursor-pointer group`}
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
        onClick={() => editable && setActionOpen(true)}
        role="button"
        tabIndex={0}
        onKeyDown={(event) => {
          if (!editable) return;
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            setActionOpen(true);
          }
        }}
      >
        <Avatar className={`${sizeClasses[size]} ring-4 ring-white shadow-xl`}>
          <AvatarImage src={displayImage} className="object-cover" />
          <AvatarFallback className="text-3xl bg-gradient-to-br from-blue-500 to-blue-600 text-white">
            {name ? name[0].toUpperCase() : <User className={iconSizes[size]} />}
          </AvatarFallback>
        </Avatar>

        {/* Hover Overlay */}
        {editable && isHovering && (
          <div className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center transition-all duration-200">
            <div className="text-center text-white">
              <Camera className={`${iconSizes[size]} mx-auto`} />
              <span className="text-xs font-medium">{hasCustomPhoto ? 'Change' : 'Add'}</span>
            </div>
          </div>
        )}
      </div>

      <Modal
        isOpen={actionOpen}
        onClose={() => setActionOpen(false)}
        title={hasCustomPhoto ? 'Edit profile picture' : 'Add profile picture'}
      >
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-2xl border bg-gray-50 p-3">
            <Avatar className="w-14 h-14">
              <AvatarImage src={displayImage} className="object-cover" />
              <AvatarFallback className="bg-blue-600 text-white">{name ? name[0].toUpperCase() : 'U'}</AvatarFallback>
            </Avatar>
            <div>
              <p className="text-sm font-medium text-gray-900">{name}</p>
              <p className="text-sm text-gray-600">Crop your photo before saving it to your profile.</p>
            </div>
          </div>

          <div className="space-y-2">
            <Button type="button" className="w-full" onClick={() => fileInputRef.current?.click()}>
              <Upload className="w-4 h-4" />
              {hasCustomPhoto ? 'Change profile picture' : 'Add profile picture'}
            </Button>

            {hasCustomPhoto && (
              <Button
                type="button"
                variant="outline"
                className="w-full text-red-600 hover:text-red-700"
                onClick={() => void handleRemovePhoto()}
                disabled={isRemoving}
              >
                {isRemoving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                {isRemoving ? 'Removing...' : 'Remove profile picture'}
              </Button>
            )}

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
        title="Crop profile picture"
      >
        <div className="space-y-4">
          <div className="relative h-80 w-full overflow-hidden rounded-2xl bg-gray-950">
            {sourceImage && (
              <Cropper
                image={sourceImage}
                crop={crop}
                zoom={zoom}
                aspect={1}
                cropShape="round"
                showGrid={false}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={(_, croppedPixels) => setCroppedAreaPixels(croppedPixels)}
              />
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm text-gray-600">
              <span>Zoom</span>
              <span>{Math.round(zoom * 100)}%</span>
            </div>
            <input
              type="range"
              min="1"
              max="3"
              step="0.01"
              value={zoom}
              onChange={(event) => setZoom(Number(event.target.value))}
              className="w-full accent-blue-600"
            />
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => setCropOpen(false)} disabled={isSaving}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void handleSaveCrop()} disabled={isSaving || !croppedAreaPixels}>
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {isSaving ? 'Saving...' : 'Save picture'}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
