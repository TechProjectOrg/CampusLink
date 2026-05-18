import { useState, useRef, useEffect, useCallback } from 'react';
import { ImageWithFallback } from '../figma/ImageWithFallback';
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
  const [selectedIndex, setSelectedIndex] = useState(0);
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  if (images.length === 0) return null;

  const alt = opportunity.title || 'Post image';
  const isDetail = variant === 'detail';
  const frameClassName = isDetail
    ? 'w-full rounded-xl bg-gray-50 overflow-hidden'
    : 'relative w-full overflow-hidden group cursor-pointer';
  const scrollerClassName = isDetail
    ? 'hide-scrollbar grid grid-flow-col auto-cols-[100%] w-full overflow-x-auto overscroll-x-contain snap-x snap-mandatory'
    : 'hide-scrollbar grid grid-flow-col auto-cols-[100%] w-full overflow-x-auto overscroll-x-contain snap-x snap-mandatory';
  const slideClassName = isDetail
    ? 'relative flex-none min-w-full w-full snap-start'
    : 'relative flex-none min-w-full w-full snap-start';
  const imageClassName = isDetail
    ? 'w-full max-h-[34rem] object-contain bg-gray-50'
    : 'w-full h-48 sm:h-64 md:h-80 object-cover transition-transform duration-500 group-hover:scale-105';

  return (
    <>
      <div
        className={frameClassName}
        onClick={() => onOpenPost?.()}
        role={onOpenPost ? 'button' : undefined}
        tabIndex={onOpenPost ? 0 : undefined}
        onKeyDown={(e) => {
          if (onOpenPost && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            onOpenPost();
          }
        }}
      >
        <div
          ref={scrollerRef}
          className={scrollerClassName}
          onScroll={() => {
            const scroller = scrollerRef.current;
            if (!scroller) return;
            const idx = Math.round(scroller.scrollLeft / scroller.clientWidth);
            setSelectedIndex(Math.max(0, Math.min(images.length - 1, idx)));
          }}
        >
          {images.map((src, index) => (
            <div key={`${src}-${index}`} className={slideClassName}>
              <button
                type="button"
                className="relative block h-full w-full cursor-pointer border-0 bg-transparent p-0"
                onClick={() => {
                  // open the post detail view instead of a lightbox
                  onOpenPost?.();
                }}
                aria-label={images.length > 1 ? `${alt}, image ${index + 1} of ${images.length}` : alt}
              >
                <ImageWithFallback
                  src={src}
                  alt={images.length > 1 ? `${alt} (${index + 1}/${images.length})` : alt}
                  loading={index === 0 ? 'eager' : 'lazy'}
                  className={imageClassName}
                />
                {!isDetail && (
                  <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                )}
              </button>
            </div>
          ))}

          {/* Prev/Next buttons for desktop */}
          <button
            type="button"
            onClick={() => {
              const scroller = scrollerRef.current;
              if (!scroller) return;
              const next = Math.max(0, selectedIndex - 1);
              scroller.scrollTo({ left: next * scroller.clientWidth, behavior: 'smooth' });
              setSelectedIndex(next);
            }}
            aria-label="Previous image"
            className="hidden md:inline-flex absolute left-3 top-1/2 -translate-y-1/2 z-10 items-center justify-center rounded-full bg-white/95 border border-slate-200 shadow-sm p-2 text-slate-700"
          >
            <span className="text-sm">‹</span>
          </button>

          <button
            type="button"
            onClick={() => {
              const scroller = scrollerRef.current;
              if (!scroller) return;
              const next = Math.min(images.length - 1, selectedIndex + 1);
              scroller.scrollTo({ left: next * scroller.clientWidth, behavior: 'smooth' });
              setSelectedIndex(next);
            }}
            aria-label="Next image"
            className="hidden md:inline-flex absolute right-3 top-1/2 -translate-y-1/2 z-10 items-center justify-center rounded-full bg-white/95 border border-slate-200 shadow-sm p-2 text-slate-700"
          >
            <span className="text-sm">›</span>
          </button>

          {/* Indicators */}
          <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-2 pointer-events-none">
            {images.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => {
                  const scroller = scrollerRef.current;
                  if (!scroller) return;
                  scroller.scrollTo({ left: i * scroller.clientWidth, behavior: 'smooth' });
                  setSelectedIndex(i);
                }}
                aria-label={`Go to image ${i + 1}`}
                className={
                  'pointer-events-auto h-2 w-2 rounded-full transition-all ' +
                  (i === selectedIndex
                    ? 'bg-primary scale-110 shadow-sm ring-2 ring-white'
                    : 'bg-white/60 hover:bg-white/80')
                }
              />
            ))}
          </div>
        </div>
      </div>
      {/* keep carousel position synced when index changes or viewport resizes */}
      <>
        <SyncCarouselScroll scrollerRef={scrollerRef} selectedIndex={selectedIndex} />
      </>
      {/* Lightbox removed — clicking opens post detail instead */}
    </>
  );
}

  function SyncCarouselScroll({
    scrollerRef,
    selectedIndex,
  }: {
    scrollerRef: React.RefObject<HTMLDivElement | null>;
    selectedIndex: number;
  }) {
    useEffect(() => {
      const scroller = scrollerRef.current;
      if (!scroller) return;
      scroller.scrollTo({ left: selectedIndex * scroller.clientWidth, behavior: 'smooth' });
    }, [selectedIndex, scrollerRef]);

    useEffect(() => {
      const onResize = () => {
        const scroller = scrollerRef.current;
        if (!scroller) return;
        // snap to current index after resize to keep one-slide view
        scroller.scrollTo({ left: selectedIndex * scroller.clientWidth, behavior: 'instant' as ScrollBehavior });
      };
      window.addEventListener('resize', onResize);
      return () => window.removeEventListener('resize', onResize);
    }, [scrollerRef, selectedIndex]);

    return null;
  }
