import { useState } from 'react';
import { ImageLightbox } from '../common/ImageLightbox';
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
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  if (images.length === 0) return null;

  const alt = opportunity.title || 'Post image';
  const isDetail = variant === 'detail';
  const frameClassName = isDetail
    ? 'w-full rounded-xl bg-gray-50 overflow-hidden'
    : 'relative w-full overflow-hidden group cursor-pointer';
  const scrollerClassName = isDetail
    ? 'hide-scrollbar flex w-full overflow-x-auto overscroll-x-contain snap-x snap-mandatory'
    : 'hide-scrollbar flex w-full overflow-x-auto overscroll-x-contain snap-x snap-mandatory';
  const slideClassName = isDetail
    ? 'relative flex-none basis-full w-full snap-start'
    : 'relative flex-none basis-full w-full snap-start';
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
        <div className={scrollerClassName}>
          {images.map((src, index) => (
            <div key={`${src}-${index}`} className={slideClassName}>
              <button
                type="button"
                className="relative block h-full w-full cursor-pointer border-0 bg-transparent p-0"
                onClick={(e) => {
                  if (enableLightbox) {
                    e.stopPropagation();
                    setLightboxIndex(index);
                    setLightboxOpen(true);
                  }
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
        </div>
      </div>
      {enableLightbox && (
        <ImageLightbox
          images={images}
          alt={alt}
          open={lightboxOpen}
          initialIndex={lightboxIndex}
          onOpenChange={setLightboxOpen}
        />
      )}
    </>
  );
}
