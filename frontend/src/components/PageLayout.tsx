import type { ReactNode } from 'react';
import { cn } from './ui/utils';

const maxWidthClasses = {
  '4xl': 'max-w-4xl',
  '6xl': 'max-w-6xl',
  '7xl': 'max-w-7xl',
} as const;

type PageLayoutMaxWidth = keyof typeof maxWidthClasses;

interface PageLayoutProps {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  maxWidth?: PageLayoutMaxWidth;
  hideScrollbar?: boolean;
}

export function PageLayout({
  children,
  className,
  contentClassName,
  maxWidth = '7xl',
  hideScrollbar = false,
}: PageLayoutProps) {
  return (
    <div
      className={cn(
        'min-h-screen bg-gradient-to-br from-gray-50 via-blue-50/30 to-purple-50/30 animate-fade-in pb-20 md:pb-0',
        hideScrollbar && 'hide-scrollbar',
        className
      )}
    >
      <div className={cn('mx-auto w-full px-4', maxWidthClasses[maxWidth], contentClassName)}>
        {children}
      </div>
    </div>
  );
}
