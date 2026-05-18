import { useState, useRef, useEffect, useCallback } from 'react';
import { ImageWithFallback } from '../figma/ImageWithFallback';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import type { Opportunity } from '../../types';

export interface PostCarouselProps {
  opportunity: Pick<Opportunity, 'images' | 'image' | 'title'>;
  variant?: 'feed' | 'detail';
  onOpenPost?: () => void;
  enableLightbox?: boolean;
}

function resolveOpportunityImages(opportunity: Pick<Opportunity, 'images' | 'image'>): string[] {
  if (opportunity.images?.length) return opportunity.images;
  return opportunity.image ? [opportunity.image] : [];
}

export function PostCarousel({
  opportunity,
  variant = 'feed',
  onOpenPost,
  enableLightbox = true,
}: PostCarouselProps) {
  const images = resolveOpportunityImages(opportunity);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [imagePopupIndex, setImagePopupIndex] = useState<number | null>(null);
  const touchStartRef = useRef<number | null>(null);
  const touchEndRef = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  if (images.length === 0) return null;

  const alt = opportunity.title || 'Post image';
  const isDetail = variant === 'detail';
  const hasMultipleImages = images.length > 1;

  // Container dimensions - fixed size prevents layout shifts
  const containerHeight = isDetail ? 'h-[26rem]' : 'h-80';
  const backgroundColor = isDetail ? 'bg-gray-50' : 'bg-gray-950';

  const handlePrevious = useCallback(() => {
    setCurrentIndex((prev) => (prev === 0 ? images.length - 1 : prev - 1));
  }, [images.length]);

  const handleNext = useCallback(() => {
    setCurrentIndex((prev) => (prev === images.length - 1 ? 0 : prev + 1));
  }, [images.length]);

  const handleLightboxPrevious = useCallback(() => {
    setLightboxIndex((prev) => (prev === 0 ? images.length - 1 : prev - 1));
  }, [images.length]);

  const handleLightboxNext = useCallback(() => {
    setLightboxIndex((prev) => (prev === images.length - 1 ? 0 : prev + 1));
  }, [images.length]);

  // Touch swipe handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartRef.current = e.targetTouches[0].clientX;
    touchEndRef.current = null;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    touchEndRef.current = e.changedTouches[0].clientX;
    handleSwipe();
  };

  const handleSwipe = useCallback(() => {
    if (!touchStartRef.current || !touchEndRef.current) return;

    const distance = touchStartRef.current - touchEndRef.current;
    const minSwipeDistance = 50;

    if (Math.abs(distance) > minSwipeDistance) {
      if (distance > 0) {
        handleNext();
      } else {
        handlePrevious();
      }
    }

    touchStartRef.current = null;
    touchEndRef.current = null;
  }, [handleNext, handlePrevious]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isLightboxOpen) {
        if (e.key === 'ArrowLeft') {
          handleLightboxPrevious();
        } else if (e.key === 'ArrowRight') {
          handleLightboxNext();
        } else if (e.key === 'Escape') {
          setIsLightboxOpen(false);
        }
      } else {
        if (e.key === 'ArrowLeft') {
          handlePrevious();
        } else if (e.key === 'ArrowRight') {
          handleNext();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleNext, handlePrevious, handleLightboxNext, handleLightboxPrevious, isLightboxOpen]);

  // Disable body scroll when lightbox is open
  useEffect(() => {
    if (isLightboxOpen) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [isLightboxOpen]);

  const openLightbox = (index: number) => {
    if (enableLightbox) {
      setLightboxIndex(index);
      setIsLightboxOpen(true);
    }
  };

  return (
    <>
      {/* POST VIEW CAROUSEL */}
      <div
        ref={containerRef}
        className={`relative w-full ${containerHeight} ${backgroundColor} overflow-hidden rounded-2xl group cursor-pointer transition-all duration-300 hover:shadow-lg`}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        role={onOpenPost ? 'button' : undefined}
        tabIndex={onOpenPost ? 0 : undefined}
        onKeyDown={(e) => {
          if (onOpenPost && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            onOpenPost();
          }
        }}
      >
        {/* Image track - CRITICAL: flex with transform */}
        <div
          className="flex h-full w-full transition-transform duration-300 ease-out"
          style={{
            transform: `translateX(-${currentIndex * 100}%)`,
          }}
        >
          {images.map((src, index) => (
            <div
              key={`slide-${index}`}
              className="min-w-full w-full flex-shrink-0 relative h-full"
            >
              <button
                type="button"
                className="w-full h-full border-0 bg-transparent p-0 cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenPost?.();
                }}
                aria-label={hasMultipleImages ? `${alt}, image ${index + 1} of ${images.length}` : alt}
              >
                <ImageWithFallback
                  src={src}
                  alt={hasMultipleImages ? `${alt} (${index + 1}/${images.length})` : alt}
                  loading={index === 0 ? 'eager' : 'lazy'}
                  className="w-full h-full object-cover object-center"
                />
                {!isDetail && (
                  <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                )}
              </button>
            </div>
          ))}
        </div>

        {/* Previous button - desktop only, multiple images only */}
        {hasMultipleImages && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handlePrevious();
            }}
            aria-label="Previous image"
            className="hidden md:inline-flex absolute left-3 top-1/2 -translate-y-1/2 z-20 items-center justify-center rounded-full bg-slate-600/85 hover:bg-slate-700 border border-slate-500/60 shadow-lg hover:shadow-xl p-2.5 text-white transition-all duration-200"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
        )}

        {/* Next button - desktop only, multiple images only */}
        {hasMultipleImages && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleNext();
            }}
            aria-label="Next image"
            className="hidden md:inline-flex absolute right-3 top-1/2 -translate-y-1/2 z-20 items-center justify-center rounded-full bg-slate-600/85 hover:bg-slate-700 border border-slate-500/60 shadow-lg hover:shadow-xl p-2.5 text-white transition-all duration-200"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        )}

        {/* Indicator dots - multiple images only */}
        {hasMultipleImages && (
          <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5 pointer-events-none">
            {images.map((_, i) => (
              <button
                key={`indicator-${i}`}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setCurrentIndex(i);
                }}
                aria-label={`Go to image ${i + 1}`}
                className={`pointer-events-auto h-2 w-2 rounded-full transition-all duration-200 ${
                  i === currentIndex
                    ? 'bg-white scale-125 shadow-lg ring-2 ring-white/30'
                    : 'bg-white/40 hover:bg-white/60'
                }`}
              />
            ))}
          </div>
        )}
      </div>

      {/* FULLSCREEN LIGHTBOX */}
      {isLightboxOpen && enableLightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-4"
          onClick={() => setIsLightboxOpen(false)}
        >
          {/* Close button */}
          <button
            type="button"
            onClick={() => setIsLightboxOpen(false)}
            aria-label="Close fullscreen"
            className="absolute top-4 right-4 z-50 rounded-full bg-white/20 hover:bg-white/30 p-2 text-white transition-all duration-200"
          >
            <X className="w-6 h-6" />
          </button>

          {/* Fullscreen image container */}
          <div className="relative w-full h-full flex items-center justify-center">
            {/* Image with object-contain to preserve full image */}
            <div
              className="max-w-full max-h-full flex items-center justify-center cursor-pointer hover:opacity-90 transition-opacity"
              onClick={(e) => {
                e.stopPropagation();
                setImagePopupIndex(lightboxIndex);
              }}
            >
              <img
                src={images[lightboxIndex]}
                alt={`${alt} fullscreen`}
                className="max-w-full max-h-full object-contain"
              />
            </div>

            {/* Previous button in lightbox */}
            {hasMultipleImages && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleLightboxPrevious();
                }}
                aria-label="Previous fullscreen image"
                className="absolute left-4 top-1/2 -translate-y-1/2 z-40 rounded-full bg-white/20 hover:bg-white/30 p-3 text-white transition-all duration-200"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
            )}

            {/* Next button in lightbox */}
            {hasMultipleImages && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleLightboxNext();
                }}
                aria-label="Next fullscreen image"
                className="absolute right-4 top-1/2 -translate-y-1/2 z-40 rounded-full bg-white/20 hover:bg-white/30 p-3 text-white transition-all duration-200"
              >
                <ChevronRight className="w-6 h-6" />
              </button>
            )}

            {/* Fullscreen indicators */}
            {hasMultipleImages && (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex justify-center gap-2 pointer-events-none">
                {images.map((_, i) => (
                  <button
                    key={`fullscreen-indicator-${i}`}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setLightboxIndex(i);
                    }}
                    aria-label={`Go to fullscreen image ${i + 1}`}
                    className={`pointer-events-auto h-2 w-2 rounded-full transition-all duration-200 ${
                      i === lightboxIndex
                        ? 'bg-white scale-125 shadow-lg ring-2 ring-white/50'
                        : 'bg-white/35 hover:bg-white/55'
                    }`}
                  />
                ))}
              </div>
            )}

            {/* Image counter in lightbox */}
            {hasMultipleImages && (
              <div className="absolute top-4 left-4 text-white/80 text-sm font-medium">
                {lightboxIndex + 1} / {images.length}
              </div>
            )}
          </div>
        </div>
      )}

      {/* IMAGE POPUP WITH BLURRED BACKGROUND */}
      {imagePopupIndex !== null && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 pointer-events-none"
          onClick={() => setImagePopupIndex(null)}
        >
          {/* Blurred background */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-md pointer-events-auto"
            onClick={() => setImagePopupIndex(null)}
          />

          {/* Close button */}
          <button
            type="button"
            onClick={() => setImagePopupIndex(null)}
            aria-label="Close image popup"
            className="absolute top-4 right-4 z-[61] rounded-full bg-white/20 hover:bg-white/40 p-2 text-white transition-all duration-200 pointer-events-auto"
          >
            <X className="w-6 h-6" />
          </button>

          {/* Image popup container */}
          <div
            className="relative max-w-4xl max-h-[90vh] pointer-events-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={images[imagePopupIndex]}
              alt={`${alt} popup`}
              className="w-full h-full object-contain rounded-lg shadow-2xl"
            />
          </div>
        </div>
      )}
    </>
  );
}
