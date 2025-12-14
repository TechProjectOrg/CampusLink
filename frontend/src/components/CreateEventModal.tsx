import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { toast } from 'sonner';

interface CreateEventModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateEvent: (event: any) => void;
  currentUser: any;
}

export function CreateEventModal({
  isOpen,
  onClose,
  onCreateEvent,
  currentUser
}: CreateEventModalProps) {
  const [formData, setFormData] = useState({
    title: '',
    mode: 'Online' as 'Online' | 'Offline',
    dateTime: '',
    location: '',
    description: '',
    registrationLink: ''
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title || !formData.description || !formData.dateTime) {
      toast.error('Please fill in all required fields');
      return;
    }

    const newEvent = {
      id: Date.now().toString(),
      authorId: currentUser?.id || 'current',
      authorName: currentUser?.name || 'Unknown User',
      authorAvatar: currentUser?.avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=Default',
      type: 'event',
      title: formData.title,
      description: formData.description,
      date: new Date().toISOString(),
      eventDate: formData.dateTime,
      location: formData.mode === 'Offline' ? formData.location : 'Online',
      link: formData.registrationLink || undefined,
      likes: [],
      comments: [],
      saved: []
    };

    onCreateEvent(newEvent);
    toast.success('Event created successfully!');
    onClose();

    // Reset form
    setFormData({
      title: '',
      mode: 'Online',
      dateTime: '',
      location: '',
      description: '',
      registrationLink: ''
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create a New Event</DialogTitle>
          <DialogDescription>
            Organize an event for the community
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Event Title *</Label>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="e.g. Workshop on AI"
              required
            />
          </div>

          <div className="space-y-2">
            <Label>Mode *</Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setFormData({ ...formData, mode: 'Online' })}
                className={`p-3 rounded-xl border-2 transition-all ${
                  formData.mode === 'Online'
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                Online
              </button>
              <button
                type="button"
                onClick={() => setFormData({ ...formData, mode: 'Offline' })}
                className={`p-3 rounded-xl border-2 transition-all ${
                  formData.mode === 'Offline'
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                Offline
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="datetime">Date & Time *</Label>
            <Input
              id="datetime"
              type="datetime-local"
              value={formData.dateTime}
              onChange={(e) => setFormData({ ...formData, dateTime: e.target.value })}
              required
            />
          </div>

          {formData.mode === 'Offline' && (
            <div className="space-y-2">
              <Label htmlFor="location">Location *</Label>
              <Input
                id="location"
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                placeholder="e.g. Main Auditorium"
                required
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="description">Description *</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Tell us more about the event..."
              rows={4}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="registrationLink">Registration Link (optional)</Label>
            <Input
              id="registrationLink"
              value={formData.registrationLink}
              onChange={(e) => setFormData({ ...formData, registrationLink: e.target.value })}
              placeholder="https://example.com/register"
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit">Create Event</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
