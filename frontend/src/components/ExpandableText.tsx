import { useLayoutEffect, useRef, useState } from 'react';

interface ExpandableTextProps {
  text: string;
  className?: string;
  buttonClassName?: string;
  collapsedLines?: number;
}

export function ExpandableText({
  text,
  className,
  buttonClassName,
  collapsedLines = 2,
}: ExpandableTextProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const measureRef = useRef<HTMLDivElement | null>(null);
  const measureTextRef = useRef<HTMLSpanElement | null>(null);
  const measureToggleRef = useRef<HTMLSpanElement | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isExpandable, setIsExpandable] = useState(false);
  const [collapsedText, setCollapsedText] = useState(text);

  useLayoutEffect(() => {
    setIsExpanded(false);
  }, [text]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const measure = measureRef.current;
    const measureText = measureTextRef.current;
    const measureToggle = measureToggleRef.current;
    if (!container || !measure || !measureText || !measureToggle) return;

    const updateCollapsedState = () => {
      const containerWidth = container.clientWidth;
      if (containerWidth <= 0) return;

      measure.style.width = `${containerWidth}px`;

      const computedStyle = window.getComputedStyle(measureText);
      const lineHeight = Number.parseFloat(computedStyle.lineHeight);
      const fontSize = Number.parseFloat(computedStyle.fontSize);
      const fallbackLineHeight = Number.isFinite(fontSize) ? fontSize * 1.5 : 24;
      const maxHeight = (Number.isFinite(lineHeight) ? lineHeight : fallbackLineHeight) * collapsedLines + 1;

      measureText.textContent = text;
      measureToggle.textContent = '';

      if (measure.scrollHeight <= maxHeight) {
        setIsExpandable(false);
        setCollapsedText(text);
        return;
      }

      setIsExpandable(true);
      measureToggle.textContent = ' See more';

      const fitsWithinLimit = (value: string) => {
        measureText.textContent = value.length > 0 ? `${value}...` : '...';
        return measure.scrollHeight <= maxHeight;
      };

      let low = 0;
      let high = text.length;
      let best = '';

      while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        const candidate = text.slice(0, mid).trimEnd();
        if (fitsWithinLimit(candidate)) {
          best = candidate;
          low = mid + 1;
        } else {
          high = mid - 1;
        }
      }

      const lastWordBoundary = best.lastIndexOf(' ');
      if (lastWordBoundary > 0) {
        const wordSafeCandidate = best.slice(0, lastWordBoundary).trimEnd();
        if (wordSafeCandidate.length > 0 && fitsWithinLimit(wordSafeCandidate)) {
          best = wordSafeCandidate;
        }
      }

      setCollapsedText(best.trimEnd());
    };

    updateCollapsedState();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateCollapsedState);
      return () => window.removeEventListener('resize', updateCollapsedState);
    }

    const resizeObserver = new ResizeObserver(() => {
      updateCollapsedState();
    });

    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, [buttonClassName, className, collapsedLines, text]);

  return (
    <div ref={containerRef} className={`cl-expandable-text ${isExpanded ? 'cl-expandable-text-expanded' : 'cl-expandable-text-collapsed'}`}>
      <p className={className?.trim()}>
        {isExpanded || !isExpandable ? text : `${collapsedText}...`}
        {isExpandable ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setIsExpanded((current) => !current);
            }}
            className={`${buttonClassName ?? ''} cl-expandable-text-toggle`.trim()}
          >
            {isExpanded ? ' See less' : ' See more'}
          </button>
        ) : null}
      </p>
      <div ref={measureRef} aria-hidden="true" className="cl-expandable-text-measure">
        <span ref={measureTextRef} className={className?.trim()} />
        <span ref={measureToggleRef} className={`${buttonClassName ?? ''} cl-expandable-text-toggle`.trim()} />
      </div>
    </div>
  );
}
