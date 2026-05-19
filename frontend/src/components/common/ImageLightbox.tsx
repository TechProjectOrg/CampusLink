import { useEffect, useState } from 'react';
import { Dialog, DialogOverlay, DialogPortal, DialogTitle } from '../ui/dialog';
import { ImageCarousel } from './ImageCarousel';
import { X } from 'lucide-react';

export interface ImageLightboxProps {
  images: string[];
  alt: string;
  open: boolean;
  initialIndex?: number;
  onOpenChange: (open: boolean) => void;
}

export function ImageLightbox({ images, alt, open, initialIndex = 0, onOpenChange }: ImageLightboxProps) {
  const [startIndex, setStartIndex] = useState(initialIndex);

  useEffect(() => {
    if (open) setStartIndex(initialIndex);
  }, [open, initialIndex]);

  if (images.length === 0) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay className="z-50 bg-black/80 backdrop-blur-sm" />
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
          <div className="relative flex h-full w-full items-center justify-center overflow-hidden">
            <DialogTitle className="sr-only">{alt}</DialogTitle>
            <button
              type="button"
              className="absolute right-3 top-3 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-white transition-colors hover:bg-black/60"
              onClick={() => onOpenChange(false)}
              aria-label="Close image viewer"
            >
              <X className="h-5 w-5" />
            </button>
            {images.length === 1 ? (
              <div className="flex h-full w-full items-center justify-center">
                <img
                  src={images[0]}
                  alt={alt}
                  className="max-h-[calc(100dvh-1.5rem)] max-w-[calc(100dvw-1.5rem)] object-contain sm:max-h-[calc(100dvh-3rem)] sm:max-w-[calc(100dvw-3rem)]"
                />
              </div>
            ) : (
              <div className="h-full w-full">
                <ImageCarousel
                  key={`${open}-${startIndex}-${images.join('|')}`}
                  images={images}
                  alt={alt}
                  variant="detail"
                  className="h-full min-h-0 w-full bg-black"
                  startIndex={startIndex}
                />
              </div>
            )}
          </div>
        </div>
      </DialogPortal>
    </Dialog>
  );
}
