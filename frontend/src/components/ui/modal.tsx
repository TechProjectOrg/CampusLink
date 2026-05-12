import { X } from 'lucide-react';
import { useEffect } from 'react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

let modalScrollLockCount = 0;
let lockedScrollY = 0;
let previousBodyOverflow = '';
let previousBodyPosition = '';
let previousBodyTop = '';
let previousBodyWidth = '';
let previousHtmlOverflow = '';

function lockModalBackgroundScroll() {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;
  if (modalScrollLockCount === 0) {
    lockedScrollY = window.scrollY;
    previousBodyOverflow = document.body.style.overflow;
    previousBodyPosition = document.body.style.position;
    previousBodyTop = document.body.style.top;
    previousBodyWidth = document.body.style.width;
    previousHtmlOverflow = document.documentElement.style.overflow;

    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.top = `-${lockedScrollY}px`;
    document.body.style.width = '100%';
  }
  modalScrollLockCount += 1;
}

function unlockModalBackgroundScroll() {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;
  modalScrollLockCount = Math.max(0, modalScrollLockCount - 1);
  if (modalScrollLockCount === 0) {
    document.documentElement.style.overflow = previousHtmlOverflow;
    document.body.style.overflow = previousBodyOverflow;
    document.body.style.position = previousBodyPosition;
    document.body.style.top = previousBodyTop;
    document.body.style.width = previousBodyWidth;
    window.scrollTo(0, lockedScrollY);
  }
}

export function Modal({ isOpen, onClose, title, children, className, style }: ModalProps) {
  useEffect(() => {
    if (isOpen) {
      lockModalBackgroundScroll();
    } else {
      unlockModalBackgroundScroll();
    }
    return () => {
      if (isOpen) {
        unlockModalBackgroundScroll();
      }
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      {/* Modal Content */}
      <div
        className={`relative mx-4 flex h-auto max-h-[90vh] flex-col overflow-y-auto hide-scrollbar rounded-xl bg-white shadow-2xl animate-fade-in w-[min(56rem,calc(100vw-2rem))] min-w-[28rem] max-w-[calc(100vw-2rem)] ${className ?? ''}`}
        style={style}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          <button
            onClick={onClose}
            className="p-1 rounded-full hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>
        {/* Body */}
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}
