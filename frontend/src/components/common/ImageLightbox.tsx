import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogTitle } from '../ui/dialog';
import { ImageCarousel } from './ImageCarousel';
import { X } from 'lucide-react';
import { Button } from '../ui/button';

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
      <DialogContent className="max-w-[min(96vw,56rem)] border-0 bg-black/95 p-0 text-white shadow-2xl [&>button]:hidden">
        <DialogTitle className="sr-only">{alt}</DialogTitle>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute right-3 top-3 z-20 text-white hover:bg-white/20"
          onClick={() => onOpenChange(false)}
          aria-label="Close image viewer"
        >
          <X className="h-5 w-5" />
        </Button>
        <div className="p-2 sm:p-4">
          <ImageCarousel
            key={`${open}-${startIndex}-${images.join('|')}`}
            images={images}
            alt={alt}
            variant="detail"
            className="w-full rounded-lg bg-black"
            startIndex={startIndex}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
