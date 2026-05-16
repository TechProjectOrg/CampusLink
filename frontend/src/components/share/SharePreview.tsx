import React from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';

interface SharePreviewProps {
  avatar?: string | null;
  title?: string;
  text?: string;
}

export function SharePreview({ avatar, title, text }: SharePreviewProps) {
  return (
    <div className="flex items-start gap-3">
      <Avatar className="w-10 h-10">
        {avatar ? <AvatarImage src={avatar} /> : <AvatarFallback>S</AvatarFallback>}
      </Avatar>
      <div className="flex-1 min-w-0">
        {title && <p className="text-sm font-semibold text-gray-900 truncate">{title}</p>}
        {text && <p className="text-sm text-gray-500 truncate">{text}</p>}
      </div>
    </div>
  );
}

export default SharePreview;
