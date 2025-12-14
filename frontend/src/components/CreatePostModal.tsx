import { useState } from 'react';
import { X } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { ImageUpload } from './ui/ImageUpload';
import { toast } from 'sonner';

interface CreatePostModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreatePost: (post: any) => void;
  currentUser: any;
}

export function CreatePostModal({
  isOpen,
  onClose,
  onCreatePost,
  currentUser
}: CreatePostModalProps) {
  const [postText, setPostText] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!postText) {
      toast.error('Post content cannot be empty');
      return;
    }

    const newPost = {
      id: Date.now().toString(),
      authorId: currentUser?.id || 'current',
      authorName: currentUser?.name || 'Unknown User',
      authorAvatar: currentUser?.avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=Default',
      type: 'general',
      title: '',
      description: postText,
      date: new Date().toISOString(),
      image: imageFile ? URL.createObjectURL(imageFile) : undefined,
      tags: tags,
      likes: [],
      comments: [],
      saved: []
    };

    onCreatePost(newPost);
    toast.success('Post created successfully!');
    onClose();
    
    // Reset form
    setPostText('');
    setImageFile(null);
    setTags([]);
    setTagInput('');
  };

  const addTag = () => {
    if (tagInput && !tags.includes(tagInput)) {
      setTags([...tags, tagInput]);
      setTagInput('');
    }
  };

  const removeTag = (tag: string) => {
    setTags(tags.filter(t => t !== tag));
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Create a New Post</DialogTitle>
          <DialogDescription>Share your thoughts with the community</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Textarea
            value={postText}
            onChange={(e) => setPostText(e.target.value)}
            placeholder="What's on your mind?"
            rows={5}
            className="resize-none"
          />

          <ImageUpload onFileChange={setImageFile} />

          <div className="space-y-2">
            <label htmlFor="tags" className="text-sm font-medium">Hashtags (optional)</label>
            <div className="flex gap-2">
              <Input
                id="tags"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
                placeholder="Add hashtags (press Enter)"
              />
              <Button type="button" onClick={addTag} variant="outline">
                Add
              </Button>
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              {tags.map((tag) => (
                <Badge key={tag} variant="secondary">
                  #{tag}
                  <button
                    type="button"
                    onClick={() => removeTag(tag)}
                    className="ml-2 hover:text-gray-900"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit">Post</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
