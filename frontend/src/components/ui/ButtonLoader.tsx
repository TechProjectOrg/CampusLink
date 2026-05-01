import Lottie from 'lottie-react';
import loadingAnimation from '../../assets/loading_animation.json';

interface ButtonLoaderProps {
  size?: number;
}

export function ButtonLoader({ size = 20 }: ButtonLoaderProps) {
  return (
    <span className="inline-flex items-center justify-center -my-2">
      <Lottie animationData={loadingAnimation} style={{ width: size, height: size }} />
    </span>
  );
}

