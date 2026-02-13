import { useState, useRef } from 'react';
import { Camera, User } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from './avatar';

interface ProfilePhotoUploadProps {
  currentPhoto?: string;
  name: string;
  onPhotoChange: (file: File | null, preview: string | null) => void;
  size?: 'sm' | 'md' | 'lg';
  editable?: boolean;
}

export function ProfilePhotoUpload({
  currentPhoto,
  name,
  onPhotoChange,
  size = 'lg',
  editable = true,
}: ProfilePhotoUploadProps) {
  const [preview, setPreview] = useState<string | null>(null);
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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        setPreview(result);
        onPhotoChange(file, result);
      };
      reader.readAsDataURL(file);
    }
  };

  const displayImage = preview || currentPhoto;

  return (
    <div className="relative inline-block">
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
        onClick={() => editable && fileInputRef.current?.click()}
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
              <span className="text-xs font-medium">Change</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
