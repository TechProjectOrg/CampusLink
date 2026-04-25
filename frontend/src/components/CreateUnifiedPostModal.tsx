
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { toast } from 'sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { X, Calendar, MapPin, Link as LinkIcon, DollarSign } from 'lucide-react';
import { Badge } from './ui/badge';
import { ImageUpload } from './ui/ImageUpload';
import { Opportunity } from '../types';

interface CreateUnifiedPostModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreatePost: (post: any) => Promise<void> | void;
  onCreateEvent: (event: any) => Promise<void> | void;
  onCreateOpportunity: (opportunity: any) => Promise<void> | void;
  currentUser: any;
}

export function CreateUnifiedPostModal({
  isOpen,
  onClose,
  onCreatePost,
  onCreateEvent,
  onCreateOpportunity,
  currentUser
}: CreateUnifiedPostModalProps) {

  // State for Post Form
  const [postText, setPostText] = useState('');
  const [postImageFile, setPostImageFile] = useState<File | null>(null);
  const [postTags, setPostTags] = useState<string[]>([]);
  const [postTagInput, setPostTagInput] = useState('');

  // State for Event Form
  const [eventFormData, setEventFormData] = useState({
    title: '',
    mode: 'Online' as 'Online' | 'Offline',
    dateTime: '',
    location: '',
    description: '',
    registrationLink: '',
    coverImage: null as File | null
  });

  // State for Opportunity Form
  const [opportunityFormData, setOpportunityFormData] = useState({
    title: '',
    company: '',
    type: 'internship' as Opportunity['type'],
    location: '',
    description: '',
    link: '',
    deadline: '',
    stipend: '',
    duration: '',
    tags: [] as string[],
    imageFile: null as File | null
  });
  const [opportunityTagInput, setOpportunityTagInput] = useState('');

  const getOpportunityTitlePlaceholder = (type: Opportunity['type']): string => {
    switch (type) {
      case 'internship':
        return 'e.g. Software Engineering Intern';
      case 'hackathon':
        return 'e.g. Smart India Hackathon 2025';
      case 'event':
        return 'e.g. AI Workshop on Campus';
      case 'contest':
        return 'e.g. UI/UX Design Challenge';
      default:
        return 'e.g. Opportunity Title';
    }
  };

  const resetAllForms = () => {
    // Reset Post Form
    setPostText('');
    setPostImageFile(null);
    setPostTags([]);
    setPostTagInput('');

    // Reset Event Form
    setEventFormData({
      title: '',
      mode: 'Online',
      dateTime: '',
      location: '',
      description: '',
      registrationLink: '',
      coverImage: null
    });

    // Reset Opportunity Form
    setOpportunityFormData({
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
      imageFile: null
    });
    setOpportunityTagInput('');
  };

  const handleClose = () => {
    onClose();
    // Do not reset forms on close, to preserve data if user reopens modal.
    // resetAllForms();
  };

  // Handlers for Post Form
  const handlePostSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!postText) {
      toast.error('Post content cannot be empty');
      return;
    }
    const newPost = {
      id: Date.now().toString(),
      authorId: currentUser?.id || 'current',
      authorName: currentUser?.name || 'Unknown User',
      authorAvatar: currentUser?.avatar || undefined,
      type: 'general',
      title: '',
      description: postText,
      date: new Date().toISOString(),
      image: postImageFile ? URL.createObjectURL(postImageFile) : undefined,
      imageFile: postImageFile ?? undefined,
      tags: postTags,
      likes: [],
      comments: [],
      saved: []
    };
    try {
      await onCreatePost(newPost);
      toast.success('Post created successfully!');
      resetAllForms();
      onClose();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to create post';
      toast.error(message);
    }
  };
  const addPostTag = () => {
    if (postTagInput && !postTags.includes(postTagInput)) {
      setPostTags([...postTags, postTagInput]);
      setPostTagInput('');
    }
  };
  const removePostTag = (tag: string) => {
    setPostTags(postTags.filter(t => t !== tag));
  };

  // Handlers for Event Form
  const handleEventSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!eventFormData.title || !eventFormData.description || !eventFormData.dateTime) {
      toast.error('Please fill in all required fields');
      return;
    }
    const newEvent = {
      id: Date.now().toString(),
      authorId: currentUser?.id || 'current',
      authorName: currentUser?.name || 'Unknown User',
      authorAvatar: currentUser?.avatar || undefined,
      type: 'event',
      title: eventFormData.title,
      description: eventFormData.description,
      date: new Date().toISOString(),
      eventDate: eventFormData.dateTime,
      location: eventFormData.mode === 'Offline' ? eventFormData.location : 'Online',
      link: eventFormData.registrationLink || undefined,
      image: eventFormData.coverImage ? URL.createObjectURL(eventFormData.coverImage) : undefined,
      imageFile: eventFormData.coverImage ?? undefined,
      likes: [],
      comments: [],
      saved: []
    };
    try {
      await onCreateEvent(newEvent);
      toast.success('Event created successfully!');
      resetAllForms();
      onClose();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to create event';
      toast.error(message);
    }
  };

  // Handlers for Opportunity Form
  const handleOpportunitySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!opportunityFormData.title || !opportunityFormData.description || !opportunityFormData.deadline) {
      toast.error('Please fill in all required fields');
      return;
    }
    const newOpportunity: any = {
      id: Date.now().toString(),
      authorId: currentUser?.id || 'current',
      authorName: currentUser?.name || 'Unknown User',
      authorAvatar: currentUser?.avatar || undefined,
      type: opportunityFormData.type,
      title: opportunityFormData.title,
      company: opportunityFormData.company,
      description: opportunityFormData.description,
      date: new Date().toISOString(),
      location: opportunityFormData.location || undefined,
      link: opportunityFormData.link || undefined,
      deadline: opportunityFormData.deadline,
      tags: opportunityFormData.tags,
      image: opportunityFormData.imageFile ? URL.createObjectURL(opportunityFormData.imageFile) : undefined,
      imageFile: opportunityFormData.imageFile ?? undefined,
      likes: [],
      comments: [],
      saved: []
    };

    if (opportunityFormData.type === 'internship') {
      newOpportunity.stipend = opportunityFormData.stipend;
      newOpportunity.duration = opportunityFormData.duration;
    }

    try {
      await onCreateOpportunity(newOpportunity);
      toast.success('Opportunity posted successfully!');
      resetAllForms();
      onClose();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to post opportunity';
      toast.error(message);
    }
  };
  const addOpportunityTag = () => {
    if (opportunityTagInput && !opportunityFormData.tags.includes(opportunityTagInput)) {
      setOpportunityFormData({ ...opportunityFormData, tags: [...opportunityFormData.tags, opportunityTagInput] });
      setOpportunityTagInput('');
    }
  };
  const removeOpportunityTag = (tag: string) => {
    setOpportunityFormData({ ...opportunityFormData, tags: opportunityFormData.tags.filter(t => t !== tag) });
  };


  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto max-w-[95vw]">
        <DialogHeader>
          <DialogTitle>What would you like to share?</DialogTitle>
          <DialogDescription>
            Share a post, create an event, or post an opportunity for the community.
          </DialogDescription>
        </DialogHeader>
        
        <Tabs defaultValue="post" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="post">Post</TabsTrigger>
            <TabsTrigger value="event">Create Event</TabsTrigger>
            <TabsTrigger value="opportunity">Post Opportunity</TabsTrigger>
          </TabsList>
          
          {/* Post Tab */}
          <TabsContent value="post">
            <form onSubmit={handlePostSubmit} className="space-y-4 pt-4">
              <Textarea
                value={postText}
                onChange={(e) => setPostText(e.target.value)}
                placeholder="What's on your mind?"
                rows={5}
                className="resize-none"
              />
              <ImageUpload onFileChange={setPostImageFile} />
              <div className="space-y-2">
                <Label htmlFor="post-tags">Hashtags (optional)</Label>
                <div className="flex gap-2">
                  <Input
                    id="post-tags"
                    value={postTagInput}
                    onChange={(e) => setPostTagInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addPostTag())}
                    placeholder="Add hashtags (press Enter)"
                  />
                  <Button type="button" onClick={addPostTag} variant="outline">
                    Add
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2 mt-2">
                  {postTags.map((tag) => (
                    <Badge key={tag} variant="secondary">
                      #{tag}
                      <button
                        type="button"
                        onClick={() => removePostTag(tag)}
                        className="ml-2 hover:text-gray-900"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={handleClose}>Cancel</Button>
                <Button type="submit">Post</Button>
              </div>
            </form>
          </TabsContent>

          {/* Event Tab */}
          <TabsContent value="event">
            <form onSubmit={handleEventSubmit} className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label htmlFor="event-title">Event Title *</Label>
                <Input
                  id="event-title"
                  value={eventFormData.title}
                  onChange={(e) => setEventFormData({ ...eventFormData, title: e.target.value })}
                  placeholder="e.g. Workshop on AI"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Mode *</Label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setEventFormData({ ...eventFormData, mode: 'Online' })}
                    className={`p-3 rounded-xl border-2 transition-all ${ eventFormData.mode === 'Online'
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    Online
                  </button>
                  <button
                    type="button"
                    onClick={() => setEventFormData({ ...eventFormData, mode: 'Offline' })}
                    className={`p-3 rounded-xl border-2 transition-all ${ eventFormData.mode === 'Offline'
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
                  value={eventFormData.dateTime}
                  onChange={(e) => setEventFormData({ ...eventFormData, dateTime: e.target.value })}
                  required
                />
              </div>
              {eventFormData.mode === 'Offline' && (
                <div className="space-y-2">
                  <Label htmlFor="location">Location *</Label>
                  <Input
                    id="location"
                    value={eventFormData.location}
                    onChange={(e) => setEventFormData({ ...eventFormData, location: e.target.value })}
                    placeholder="e.g. Main Auditorium"
                    required
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="event-description">Description *</Label>
                <Textarea
                  id="event-description"
                  value={eventFormData.description}
                  onChange={(e) => setEventFormData({ ...eventFormData, description: e.target.value })}
                  placeholder="Tell us more about the event..."
                  rows={4}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="registrationLink">Registration Link (optional)</Label>
                <Input
                  id="registrationLink"
                  value={eventFormData.registrationLink}
                  onChange={(e) => setEventFormData({ ...eventFormData, registrationLink: e.target.value })}
                  placeholder="https://example.com/register"
                />
              </div>
              <ImageUpload onFileChange={(file) => setEventFormData({ ...eventFormData, coverImage: file })} />
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={handleClose}>Cancel</Button>
                <Button type="submit">Create Event</Button>
              </div>
            </form>
          </TabsContent>

          {/* Opportunity Tab */}
          <TabsContent value="opportunity">
             <form onSubmit={handleOpportunitySubmit} className="space-y-4 pt-4">
                <div className="space-y-2">
                    <Label>Opportunity Type *</Label>
                    <div className="grid grid-cols-4 gap-2">
                    <button
                        type="button"
                        onClick={() => setOpportunityFormData({ ...opportunityFormData, type: 'internship' })}
                        className={`p-3 rounded-xl border-2 transition-all ${ opportunityFormData.type === 'internship'
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                    >
                        Internship
                    </button>
                    <button
                        type="button"
                        onClick={() => setOpportunityFormData({ ...opportunityFormData, type: 'hackathon' })}
                        className={`p-3 rounded-xl border-2 transition-all ${ opportunityFormData.type === 'hackathon'
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                    >
                        Hackathon
                    </button>
                    <button
                        type="button"
                        onClick={() => setOpportunityFormData({ ...opportunityFormData, type: 'event' })}
                        className={`p-3 rounded-xl border-2 transition-all ${ opportunityFormData.type === 'event'
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                    >
                        Event
                    </button>
                    <button
                        type="button"
                        onClick={() => setOpportunityFormData({ ...opportunityFormData, type: 'contest' })}
                        className={`p-3 rounded-xl border-2 transition-all ${ opportunityFormData.type === 'contest'
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                    >
                        Contest
                    </button>
                    </div>
                </div>
                <div className="space-y-2">
                    <Label htmlFor="opportunity-title">
                        {opportunityFormData.type === 'contest' ? 'Contest Title' : 'Title'} *
                    </Label>
                    <Input
                    id="opportunity-title"
                    value={opportunityFormData.title}
                    onChange={(e) => setOpportunityFormData({ ...opportunityFormData, title: e.target.value })}
                    placeholder={getOpportunityTitlePlaceholder(opportunityFormData.type)}
                    required
                    />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="company">
                        {opportunityFormData.type === 'contest' ? 'Organizer / Club / Platform name' : 'Company/Organization'} *
                    </Label>
                    <Input
                    id="company"
                    value={opportunityFormData.company}
                    onChange={(e) => setOpportunityFormData({ ...opportunityFormData, company: e.target.value })}
                    placeholder={opportunityFormData.type === 'contest' ? 'e.g. IEEE Student Chapter' : 'e.g. Google, Tech Club'}
                    required
                    />
                </div>
                {opportunityFormData.type !== 'contest' && (
                <div className="space-y-2">
                    <Label htmlFor="opportunity-location">Location</Label>
                    <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <Input
                        id="opportunity-location"
                        value={opportunityFormData.location}
                        onChange={(e) => setOpportunityFormData({ ...opportunityFormData, location: e.target.value })}
                        placeholder="e.g. Remote, Mumbai, Hybrid"
                        className="pl-10"
                    />
                    </div>
                </div>
                )}
                <div className="space-y-2">
                    <Label htmlFor="opportunity-description">Description *</Label>
                    <Textarea
                    id="opportunity-description"
                    value={opportunityFormData.description}
                    onChange={(e) => setOpportunityFormData({ ...opportunityFormData, description: e.target.value })}
                    placeholder={`About the opportunity...\nEligibility / requirements...\nBenefits / perks...`}
                    rows={4}
                    required
                    />
                </div>
                <ImageUpload onFileChange={(file) => setOpportunityFormData({ ...opportunityFormData, imageFile: file })} />
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label htmlFor="link">
                            {opportunityFormData.type === 'contest' ? 'Registration Link' : 'Application Link'}
                        </Label>
                        <div className="relative">
                            <LinkIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <Input
                            id="link"
                            value={opportunityFormData.link}
                            onChange={(e) => setOpportunityFormData({ ...opportunityFormData, link: e.target.value })}
                            placeholder="https://..."
                            className="pl-10"
                            />
                        </div>
                    </div>
                    <div className="space-y-2">
                    <Label htmlFor="deadline">
                        {opportunityFormData.type === 'contest' ? 'Deadline / Last date to participate' : 'Deadline'} *
                    </Label>
                    <div className="relative">
                        <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <Input
                        id="deadline"
                        type="date"
                        value={opportunityFormData.deadline}
                        onChange={(e) => setOpportunityFormData({ ...opportunityFormData, deadline: e.target.value })}
                        className="pl-10"
                        required
                        />
                    </div>
                    </div>
                    {opportunityFormData.type === 'internship' && (
                    <>
                        <div className="space-y-2">
                            <Label htmlFor="stipend">Stipend</Label>
                            <div className="relative">
                            <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <Input
                                id="stipend"
                                value={opportunityFormData.stipend}
                                onChange={(e) => setOpportunityFormData({ ...opportunityFormData, stipend: e.target.value })}
                                placeholder="e.g. $1000/month"
                                className="pl-10"
                            />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="duration">Duration</Label>
                            <Input
                                id="duration"
                                value={opportunityFormData.duration}
                                onChange={(e) => setOpportunityFormData({ ...opportunityFormData, duration: e.target.value })}
                                placeholder="e.g. 3 months, 2 days"
                            />
                        </div>
                    </>
                    )}
                </div>
                <div className="space-y-2">
                    <Label htmlFor="opportunity-tags">Tags</Label>
                    <div className="flex gap-2">
                    <Input
                        id="opportunity-tags"
                        value={opportunityTagInput}
                        onChange={(e) => setOpportunityTagInput(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addOpportunityTag())}
                        placeholder="Add tags (press Enter)"
                    />
                    <Button type="button" onClick={addOpportunityTag} variant="outline">
                        Add
                    </Button>
                    </div>
                    <div className="flex flex-wrap gap-2 mt-2">
                    {opportunityFormData.tags.map((tag) => (
                        <Badge key={tag} className="bg-blue-100 text-blue-800">
                        {tag}
                        <button
                            type="button"
                            onClick={() => removeOpportunityTag(tag)}
                            className="ml-2 hover:text-blue-900"
                        >
                            <X className="w-3 h-3" />
                        </button>
                        </Badge>
                    ))}
                    </div>
                </div>
                <div className="flex gap-3 pt-4">
                    <Button type="button" onClick={handleClose} variant="outline" className="flex-1">
                    Cancel
                    </Button>
                    <Button type="submit" className="flex-1 gradient-primary">
                    Post Opportunity
                    </Button>
                </div>
                </form>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
