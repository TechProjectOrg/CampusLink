import { useState } from 'react';
import { X, Users, Image as ImageIcon } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Badge } from './ui/badge';
import { toast } from 'sonner@2.0.3';
import { Club } from '../types';

interface CreateClubModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateClub: (club: Club) => void;
  currentUserId: string;
}

export function CreateClubModal({
  isOpen,
  onClose,
  onCreateClub,
  currentUserId
}: CreateClubModalProps) {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    avatarUrl: '',
    category: '',
    tags: [] as string[]
  });

  const [tagInput, setTagInput] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name || !formData.description) {
      toast.error('Please fill in all required fields');
      return;
    }

    const newClub: Club = {
      id: `club-${Date.now()}`,
      name: formData.name,
      description: formData.description,
      avatar: formData.avatarUrl || undefined,
      members: [currentUserId],
      admin: currentUserId,
      posts: []
    };

    onCreateClub(newClub);
    toast.success(`${formData.name} club created successfully!`);
    onClose();
    
    // Reset form
    setFormData({
      name: '',
      description: '',
      avatarUrl: '',
      category: '',
      tags: []
    });
    setTagInput('');
  };

  const addTag = () => {
    if (tagInput && !formData.tags.includes(tagInput)) {
      setFormData({ ...formData, tags: [...formData.tags, tagInput] });
      setTagInput('');
    }
  };

  const removeTag = (tag: string) => {
    setFormData({ ...formData, tags: formData.tags.filter(t => t !== tag) });
  };

  const categories = [
    'Technology',
    'Arts & Culture',
    'Sports',
    'Academic',
    'Social',
    'Professional',
    'Gaming',
    'Music',
    'Other'
  ];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto max-w-[95vw]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            Create New Club
          </DialogTitle>
          <DialogDescription>
            Start a community and bring together students with similar interests
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Club Name */}
          <div className="space-y-2">
            <Label htmlFor="name">Club Name *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g. Tech Innovators Club, Photography Society"
              required
            />
          </div>

          {/* Category Selection */}
          <div className="space-y-2">
            <Label>Category *</Label>
            <div className="grid grid-cols-3 gap-2">
              {categories.slice(0, 6).map((category) => (
                <button
                  key={category}
                  type="button"
                  onClick={() => setFormData({ ...formData, category })}
                  className={`p-3 rounded-xl border-2 transition-all text-sm ${
                    formData.category === category
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  {category}
                </button>
              ))}
            </div>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Description *</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Describe what your club is about, goals, and activities..."
              rows={4}
              required
            />
          </div>

          {/* Club Avatar URL */}
          <div className="space-y-2">
            <Label htmlFor="avatarUrl">Club Logo/Avatar URL (optional)</Label>
            <div className="relative">
              <ImageIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                id="avatarUrl"
                value={formData.avatarUrl}
                onChange={(e) => setFormData({ ...formData, avatarUrl: e.target.value })}
                placeholder="https://example.com/logo.jpg"
                className="pl-10"
              />
            </div>
            {formData.avatarUrl && (
              <div className="mt-2 rounded-xl overflow-hidden border border-gray-200 w-32 h-32">
                <img 
                  src={formData.avatarUrl} 
                  alt="Club avatar preview" 
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                />
              </div>
            )}
            <p className="text-xs text-gray-500">Add a logo or avatar for your club</p>
          </div>

          {/* Tags */}
          <div className="space-y-2">
            <Label htmlFor="tags">Tags (optional)</Label>
            <div className="flex gap-2">
              <Input
                id="tags"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
                placeholder="Add relevant tags (press Enter)"
              />
              <Button type="button" onClick={addTag} variant="outline">
                Add
              </Button>
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              {formData.tags.map((tag) => (
                <Badge key={tag} className="bg-blue-100 text-blue-800">
                  {tag}
                  <button
                    type="button"
                    onClick={() => removeTag(tag)}
                    className="ml-2 hover:text-blue-900"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              ))}
            </div>
          </div>

          {/* Club Guidelines */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <h4 className="text-sm font-semibold text-gray-900 mb-2">Club Guidelines</h4>
            <ul className="text-xs text-gray-600 space-y-1">
              <li>• Ensure your club promotes a positive and inclusive environment</li>
              <li>• Regularly engage with members through events and activities</li>
              <li>• Follow campus guidelines and policies</li>
              <li>• Respect diversity and encourage collaboration</li>
            </ul>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <Button type="button" onClick={onClose} variant="outline" className="flex-1">
              Cancel
            </Button>
            <Button type="submit" className="flex-1 gradient-success">
              <Users className="w-4 h-4 mr-2" />
              Create Club
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
