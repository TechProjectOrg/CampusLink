import { useState } from 'react';
import { X, Calendar, MapPin, Link as LinkIcon, DollarSign, Users, Image as ImageIcon, Upload } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Badge } from './ui/badge';
import { toast } from 'sonner@2.0.3';

interface CreateOpportunityModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateOpportunity: (opportunity: any) => void;
  currentUser: any;
}

export function CreateOpportunityModal({
  isOpen,
  onClose,
  onCreateOpportunity,
  currentUser
}: CreateOpportunityModalProps) {
  const [formData, setFormData] = useState({
    title: '',
    company: '',
    type: 'internship' as 'internship' | 'hackathon' | 'event',
    location: '',
    description: '',
    link: '',
    deadline: '',
    stipend: '',
    duration: '',
    tags: [] as string[],
    imageUrl: ''
  });

  const [tagInput, setTagInput] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.title || !formData.description) {
      toast.error('Please fill in all required fields');
      return;
    }

    const newOpportunity = {
      id: Date.now().toString(),
      authorId: currentUser?.id || 'current',
      authorName: currentUser?.name || 'Unknown User',
      authorAvatar: currentUser?.avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=Default',
      type: formData.type,
      title: formData.title,
      description: formData.description,
      date: new Date().toISOString(),
      location: formData.location || undefined,
      link: formData.link || undefined,
      image: formData.imageUrl || undefined,
      likes: [],
      comments: [],
      saved: []
    };

    onCreateOpportunity(newOpportunity);
    toast.success('Opportunity posted successfully!');
    onClose();
    
    // Reset form
    setFormData({
      title: '',
      company: '',
      type: 'internship',
      location: '',
      description: '',
      link: '',
      deadline: '',
      stipend: '',
      duration: '',
      tags: [],
      imageUrl: ''
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

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto max-w-[95vw]">
        <DialogHeader>
          <DialogTitle>Post New Opportunity</DialogTitle>
          <DialogDescription>Share your opportunity with the community</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Type Selection */}
          <div className="space-y-2">
            <Label>Opportunity Type *</Label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setFormData({ ...formData, type: 'internship' })}
                className={`p-3 rounded-xl border-2 transition-all ${
                  formData.type === 'internship'
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                Internship
              </button>
              <button
                type="button"
                onClick={() => setFormData({ ...formData, type: 'hackathon' })}
                className={`p-3 rounded-xl border-2 transition-all ${
                  formData.type === 'hackathon'
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                Hackathon
              </button>
              <button
                type="button"
                onClick={() => setFormData({ ...formData, type: 'event' })}
                className={`p-3 rounded-xl border-2 transition-all ${
                  formData.type === 'event'
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                Event
              </button>
            </div>
          </div>

          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="title">Title *</Label>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="e.g. Software Engineering Intern"
              required
            />
          </div>

          {/* Company/Organization */}
          <div className="space-y-2">
            <Label htmlFor="company">Company/Organization *</Label>
            <Input
              id="company"
              value={formData.company}
              onChange={(e) => setFormData({ ...formData, company: e.target.value })}
              placeholder="e.g. Google, Tech Club"
              required
            />
          </div>

          {/* Location */}
          <div className="space-y-2">
            <Label htmlFor="location">Location</Label>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                id="location"
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                placeholder="e.g. Remote, Mumbai, Hybrid"
                className="pl-10"
              />
            </div>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Description *</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Describe the opportunity, requirements, and benefits..."
              rows={4}
              required
            />
          </div>

          {/* Image URL */}
          <div className="space-y-2">
            <Label htmlFor="imageUrl">Cover Image URL (optional)</Label>
            <div className="relative">
              <ImageIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                id="imageUrl"
                value={formData.imageUrl}
                onChange={(e) => setFormData({ ...formData, imageUrl: e.target.value })}
                placeholder="https://example.com/image.jpg"
                className="pl-10"
              />
            </div>
            {formData.imageUrl && (
              <div className="mt-2 rounded-xl overflow-hidden border border-gray-200">
                <img 
                  src={formData.imageUrl} 
                  alt="Preview" 
                  className="w-full h-48 object-cover"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                />
              </div>
            )}
            <p className="text-xs text-gray-500">Add a cover image to make your post stand out</p>
          </div>

          {/* Additional Details Grid */}
          <div className="grid grid-cols-2 gap-4">
            {/* Link */}
            <div className="space-y-2">
              <Label htmlFor="link">Application Link</Label>
              <div className="relative">
                <LinkIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  id="link"
                  value={formData.link}
                  onChange={(e) => setFormData({ ...formData, link: e.target.value })}
                  placeholder="https://..."
                  className="pl-10"
                />
              </div>
            </div>

            {/* Deadline */}
            <div className="space-y-2">
              <Label htmlFor="deadline">Deadline</Label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  id="deadline"
                  type="date"
                  value={formData.deadline}
                  onChange={(e) => setFormData({ ...formData, deadline: e.target.value })}
                  className="pl-10"
                />
              </div>
            </div>

            {/* Stipend */}
            {formData.type === 'internship' && (
              <div className="space-y-2">
                <Label htmlFor="stipend">Stipend</Label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input
                    id="stipend"
                    value={formData.stipend}
                    onChange={(e) => setFormData({ ...formData, stipend: e.target.value })}
                    placeholder="e.g. $1000/month"
                    className="pl-10"
                  />
                </div>
              </div>
            )}

            {/* Duration */}
            <div className="space-y-2">
              <Label htmlFor="duration">Duration</Label>
              <Input
                id="duration"
                value={formData.duration}
                onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
                placeholder="e.g. 3 months, 2 days"
              />
            </div>
          </div>

          {/* Tags */}
          <div className="space-y-2">
            <Label htmlFor="tags">Tags</Label>
            <div className="flex gap-2">
              <Input
                id="tags"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
                placeholder="Add tags (press Enter)"
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

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <Button type="button" onClick={onClose} variant="outline" className="flex-1">
              Cancel
            </Button>
            <Button type="submit" className="flex-1 gradient-success">
              Post Opportunity
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}