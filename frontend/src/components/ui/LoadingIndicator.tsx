import { ButtonLoader } from './ButtonLoader';

interface LoadingIndicatorProps {
  label?: string;
  size?: number;
  className?: string;
}

export function LoadingIndicator({ label = 'Loading...', size = 40, className = '' }: LoadingIndicatorProps) {
  return (
    <div className={`flex items-center justify-center gap-2 text-sm text-gray-500 ${className}`}>
      <ButtonLoader size={size} />
      <span>{label}</span>
    </div>
  );
}
