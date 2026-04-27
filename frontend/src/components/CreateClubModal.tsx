import { useEffect, useMemo, useState } from 'react';
import { Loader2, Users } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import type { Club } from '../types';
import { apiCreateClub, apiFetchClubCategories, type ClubCategoryOption } from '../lib/clubsApi';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Badge } from './ui/badge';
import { ImageUpload } from './ui/ImageUpload';
import { ClubLogoUpload } from './ui/ClubLogoUpload';

interface CreateClubModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateClub?: (club: Club) => void;
}

export function CreateClubModal({ isOpen, onClose, onCreateClub }: CreateClubModalProps) {
  const auth = useAuth();
  const [categories, setCategories] = useState<ClubCategoryOption[]>([]);
  const [showAllCategories, setShowAllCategories] = useState(false);
  const [isLoadingCategories, setIsLoadingCategories] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [coverImageFile, setCoverImageFile] = useState<File | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    shortDescription: '',
    description: '',
    privacy: 'open' as Club['privacy'],
    primaryCategory: '',
    customCategory: '',
    tags: [] as string[],
  });

  useEffect(() => {
    if (!isOpen) return;
    let isMounted = true;
    setIsLoadingCategories(true);
    apiFetchClubCategories(auth.session?.token, showAllCategories ? 20 : 6, 0)
      .then((items) => {
        if (isMounted) {
          setCategories(items);
        }
      })
      .catch((error) => {
        console.error('Failed to load club categories:', error);
      })
      .finally(() => {
        if (isMounted) {
          setIsLoadingCategories(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [auth.session?.token, isOpen, showAllCategories]);

  const selectedCategory = useMemo(() => {
    if (formData.customCategory.trim()) return formData.customCategory.trim();
    return formData.primaryCategory;
  }, [formData.customCategory, formData.primaryCategory]);

  const addTag = () => {
    const nextTag = tagInput.trim();
    if (!nextTag || formData.tags.includes(nextTag)) return;
    setFormData((current) => ({ ...current, tags: [...current.tags, nextTag] }));
    setTagInput('');
  };

  const resetForm = () => {
    setFormData({
      name: '',
      shortDescription: '',
      description: '',
      privacy: 'open',
      primaryCategory: '',
      customCategory: '',
      tags: [],
    });
    setAvatarFile(null);
    setCoverImageFile(null);
    setTagInput('');
    setShowAllCategories(false);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!formData.name.trim() || !formData.description.trim() || !selectedCategory) {
      toast.error('Please fill in the required club details.');
      return;
    }

    setIsSubmitting(true);
    try {
      const club = await apiCreateClub(
        {
          name: formData.name.trim(),
          shortDescription: formData.shortDescription.trim() || undefined,
          description: formData.description.trim(),
          privacy: formData.privacy,
          primaryCategory: selectedCategory,
          tags: formData.tags,
        },
        auth.session?.token,
        {
          avatar: avatarFile,
          coverImage: coverImageFile,
        },
      );

      onCreateClub?.(club);
      toast.success('Club created successfully.');
      resetForm();
      onClose();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to create club';
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(nextOpen) => !nextOpen && !isSubmitting && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto max-w-[95vw]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            Create New Club
          </DialogTitle>
          <DialogDescription>
            Start a community and bring together students with similar interests.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="club-name">Club Name *</Label>
            <Input
              id="club-name"
              value={formData.name}
              onChange={(event) => setFormData((current) => ({ ...current, name: event.target.value }))}
              placeholder="e.g. Tech Innovators Club"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="club-short-description">Short Description</Label>
            <Input
              id="club-short-description"
              value={formData.shortDescription}
              onChange={(event) => setFormData((current) => ({ ...current, shortDescription: event.target.value }))}
              placeholder="One-line summary for discovery cards"
            />
          </div>

          <div className="space-y-2">
            <Label>Privacy *</Label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { value: 'open', label: 'Open' },
                { value: 'request', label: 'Request' },
                { value: 'private', label: 'Private' },
              ].map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setFormData((current) => ({ ...current, privacy: option.value as Club['privacy'] }))}
                  className={`p-3 rounded-xl border-2 transition-all text-sm ${
                    formData.privacy === option.value
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Primary Category *</Label>
            {isLoadingCategories ? (
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading categories...
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {categories.map((category) => (
                  <button
                    key={category.id}
                    type="button"
                    onClick={() =>
                      setFormData((current) => ({
                        ...current,
                        primaryCategory: category.displayName,
                        customCategory: '',
                      }))
                    }
                    className={`p-3 rounded-xl border-2 transition-all text-sm ${
                      formData.primaryCategory === category.displayName && !formData.customCategory
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {category.displayName}
                  </button>
                ))}
              </div>
            )}
            <div className="flex items-center justify-between">
              <Button type="button" variant="ghost" className="px-0 text-primary" onClick={() => setShowAllCategories((value) => !value)}>
                {showAllCategories ? 'Show less' : 'See more'}
              </Button>
            </div>
            <Input
              value={formData.customCategory}
              onChange={(event) =>
                setFormData((current) => ({
                  ...current,
                  customCategory: event.target.value,
                  primaryCategory: '',
                }))
              }
              placeholder="Or create a custom category"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="club-description">Description *</Label>
            <Textarea
              id="club-description"
              value={formData.description}
              onChange={(event) => setFormData((current) => ({ ...current, description: event.target.value }))}
              placeholder="Describe what your club is about, goals, and activities..."
              rows={4}
              required
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <ClubLogoUpload
              label="Club Logo (optional)"
              file={avatarFile}
              onFileChange={setAvatarFile}
              disabled={isSubmitting}
            />
            <ImageUpload
              onFileChange={setCoverImageFile}
              disabled={isSubmitting}
              label="Club Background Image (optional)"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="club-tags">Tags</Label>
            <div className="flex gap-2">
              <Input
                id="club-tags"
                value={tagInput}
                onChange={(event) => setTagInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    addTag();
                  }
                }}
                placeholder="Add relevant tags"
              />
              <Button type="button" variant="outline" onClick={addTag}>
                Add
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {formData.tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="gap-2">
                  {tag}
                  <button
                    type="button"
                    onClick={() =>
                      setFormData((current) => ({
                        ...current,
                        tags: current.tags.filter((existingTag) => existingTag !== tag),
                      }))
                    }
                  >
                    x
                  </button>
                </Badge>
              ))}
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" className="flex-1 gradient-success" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Users className="w-4 h-4 mr-2" />}
              Create Club
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
