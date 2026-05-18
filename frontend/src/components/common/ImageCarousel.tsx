import { memo, useCallback, useEffect, useState } from 'react';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  type CarouselApi,
} from '../ui/carousel';
import { ImageWithFallback } from '../figma/ImageWithFallback';
import { cn } from '../ui/utils';

export type ImageCarouselVariant = 'feed' | 'detail';

export interface ImageCarouselProps {
  images: string[];
  alt: string;
  variant?: ImageCarouselVariant;
  className?: string;
  onImageClick?: (index: number) => void;
  startIndex?: number;
}

const variantStyles: Record<ImageCarouselVariant, { container: string; image: string }> = {
  feed: {
    container: 'h-48 sm:h-64 md:h-80',
    image: 'object-cover',
  },
  detail: {
    container: 'max-h-[34rem] min-h-[12rem]',
    image: 'object-contain',
  },
};

function ImageCarouselComponent({
  images,
  alt,
  variant = 'feed',
  className,
  onImageClick,
  startIndex = 0,
}: ImageCarouselProps) {
  const [api, setApi] = useState<CarouselApi>();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loadedIndices, setLoadedIndices] = useState<Set<number>>(() => new Set());

  const styles = variantStyles[variant];
  const hasMultiple = images.length > 1;

  const onSelect = useCallback(() => {
    if (!api) return;
    setSelectedIndex(api.selectedScrollSnap());
  }, [api]);

  useEffect(() => {
    if (!api) return;
    onSelect();
    api.on('select', onSelect);
    api.on('reInit', onSelect);
    return () => {
      api.off('select', onSelect);
      api.off('reInit', onSelect);
    };
  }, [api, onSelect]);

  useEffect(() => {
    const nextIndex = Math.min(Math.max(startIndex, 0), Math.max(images.length - 1, 0));
    setSelectedIndex(nextIndex);
    setLoadedIndices(new Set());
    api?.scrollTo(nextIndex, true);
  }, [images, api, startIndex]);

  if (images.length === 0) return null;

  const handleImageLoad = (index: number) => {
    setLoadedIndices((prev) => {
      if (prev.has(index)) return prev;
      const next = new Set(prev);
      next.add(index);
      return next;
    });
  };

  return (
    <Carousel
      className={cn(
        'group relative w-full overflow-hidden bg-gray-100 touch-pan-y overscroll-contain',
        styles.container,
        className,
      )}
      setApi={setApi}
      opts={{ align: 'start', loop: hasMultiple, dragFree: false }}
    >
      <CarouselContent className="ml-0 h-full">
        {images.map((src, index) => (
          <CarouselItem key={`${src}-${index}`} className="basis-full pl-0 h-full">
            <button
              type="button"
              className="relative block h-full w-full cursor-pointer border-0 bg-transparent p-0"
              onClick={(e) => {
                if (onImageClick) {
                  e.stopPropagation();
                  onImageClick(index);
                }
              }}
              aria-label={hasMultiple ? `${alt}, image ${index + 1} of ${images.length}` : alt}
            >
              {!loadedIndices.has(index) && (
                <div className="absolute inset-0 animate-pulse bg-gray-200" aria-hidden />
              )}
              <ImageWithFallback
                src={src}
                alt={hasMultiple ? `${alt} (${index + 1}/${images.length})` : alt}
                loading={index === 0 ? 'eager' : 'lazy'}
                onLoad={() => handleImageLoad(index)}
                className={cn('h-full w-full', styles.image, !loadedIndices.has(index) && 'opacity-0')}
              />
            </button>
          </CarouselItem>
        ))}
      </CarouselContent>

      {hasMultiple && (
        <>
          <CarouselPrevious
            className="left-2 top-1/2 -translate-y-1/2 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 disabled:opacity-0"
            aria-label="Previous image"
          />
          <CarouselNext
            className="right-2 top-1/2 -translate-y-1/2 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 disabled:opacity-0"
            aria-label="Next image"
          />
          <div
            className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5"
            role="tablist"
            aria-label="Image navigation"
          >
            {images.map((_, index) => (
              <button
                key={index}
                type="button"
                role="tab"
                aria-selected={index === selectedIndex}
                aria-label={`Go to image ${index + 1}`}
                onClick={(e) => {
                  e.stopPropagation();
                  api?.scrollTo(index);
                }}
                className={cn(
                  'h-2 w-2 rounded-full transition-all',
                  index === selectedIndex ? 'bg-white scale-110 shadow-sm' : 'bg-white/50 hover:bg-white/80',
                )}
              />
            ))}
          </div>
        </>
      )}
    </Carousel>
  );
}

export const ImageCarousel = memo(ImageCarouselComponent);
