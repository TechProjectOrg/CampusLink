import { useState } from 'react';
import { ArrowLeft, Users, Calendar, MessageCircle, Heart, Share2, Image as ImageIcon, Pin, TrendingUp, Award } from 'lucide-react';
import { Club, Student, Opportunity } from '../types';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { Card, CardContent } from './ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { ImageWithFallback } from './figma/ImageWithFallback';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { ScrollArea } from './ui/scroll-area';

interface ClubActivityPageProps {
  club: Club;
  students: Student[];
  currentUserId: string;
  onBack: () => void;
  onViewProfile?: (studentId: string) => void;
}

interface ClubPost {
  id: string;
  authorId: string;
  content: string;
  image?: string;
  timestamp: string;
  likes: string[];
  comments: Array<{
    id: string;
    authorId: string;
    content: string;
    timestamp: string;
  }>;
  isPinned?: boolean;
}

interface ClubEvent {
  id: string;
  title: string;
  description: string;
  date: string;
  location: string;
  attendees: string[];
  image?: string;
}

export function ClubActivityPage({ club, students, currentUserId, onBack, onViewProfile }: ClubActivityPageProps) {
  const [activeTab, setActiveTab] = useState('feed');
  const [newPost, setNewPost] = useState('');
  const [newPostImage, setNewPostImage] = useState('');

  // Mock club posts
  const [clubPosts, setClubPosts] = useState<ClubPost[]>([
    {
      id: 'post1',
      authorId: '1',
      content: 'Excited to announce our upcoming hackathon! 🚀 Join us for 48 hours of innovation and coding. Registration opens next week!',
      image: 'https://images.unsplash.com/photo-1504384308090-c894fdcc538d?w=800&auto=format&fit=crop',
      timestamp: new Date(Date.now() - 86400000).toISOString(),
      likes: ['current', '2', '3'],
      comments: [
        {
          id: 'c1',
          authorId: '2',
          content: 'Can\'t wait! What\'s the theme?',
          timestamp: new Date(Date.now() - 43200000).toISOString()
        }
      ],
      isPinned: true
    },
    {
      id: 'post2',
      authorId: '2',
      content: 'Great workshop today on React best practices! Thanks everyone who attended. Slides are now available on our Discord.',
      timestamp: new Date(Date.now() - 172800000).toISOString(),
      likes: ['current', '1'],
      comments: []
    },
    {
      id: 'post3',
      authorId: '3',
      content: 'Check out our latest project showcase! Amazing work by our members 🎉',
      image: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=800&auto=format&fit=crop',
      timestamp: new Date(Date.now() - 259200000).toISOString(),
      likes: ['current', '1', '2', '4'],
      comments: [
        {
          id: 'c2',
          authorId: '1',
          content: 'Incredible projects!',
          timestamp: new Date(Date.now() - 259000000).toISOString()
        }
      ]
    }
  ]);

  // Mock club events
  const clubEvents: ClubEvent[] = [
    {
      id: 'event1',
      title: 'Web Development Workshop',
      description: 'Learn the fundamentals of modern web development with React and Tailwind CSS',
      date: new Date(Date.now() + 604800000).toISOString(),
      location: 'Computer Lab 3',
      attendees: ['current', '1', '2', '3', '4'],
      image: 'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=800&auto=format&fit=crop'
    },
    {
      id: 'event2',
      title: 'Tech Talk: AI in Healthcare',
      description: 'Guest speaker from industry discussing AI applications in healthcare',
      date: new Date(Date.now() + 1209600000).toISOString(),
      location: 'Auditorium A',
      attendees: ['current', '1', '2'],
      image: 'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=800&auto=format&fit=crop'
    }
  ];

  const clubMembers = students.filter(s => club.members.includes(s.id));
  const adminUser = students.find(s => s.id === club.admin);

  const handleLikePost = (postId: string) => {
    setClubPosts(clubPosts.map(post => {
      if (post.id === postId) {
        const isLiked = post.likes.includes(currentUserId);
        return {
          ...post,
          likes: isLiked 
            ? post.likes.filter(id => id !== currentUserId)
            : [...post.likes, currentUserId]
        };
      }
      return post;
    }));
  };

  const handleCreatePost = () => {
    if (!newPost.trim()) return;

    const post: ClubPost = {
      id: `post-${Date.now()}`,
      authorId: currentUserId,
      content: newPost,
      image: newPostImage || undefined,
      timestamp: new Date().toISOString(),
      likes: [],
      comments: []
    };

    setClubPosts([post, ...clubPosts]);
    setNewPost('');
    setNewPostImage('');
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const formatEventDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      weekday: 'long',
      month: 'long', 
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50/30 to-purple-50/30 animate-fade-in pb-20 md:pb-0">
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-6 md:py-8 space-y-6">
        {/* Header */}
        <div className="animate-slide-in-down">
          <Button 
            variant="ghost" 
            onClick={onBack}
            className="mb-4 hover:bg-white/50 transition-all"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Clubs
          </Button>

          {/* Club Banner */}
          <Card className="overflow-hidden border-0 shadow-xl">
            <div className="relative h-48 md:h-64 bg-gradient-to-r from-blue-500 to-purple-600">
              <ImageWithFallback
                src={club.avatar}
                alt={club.name}
                className="w-full h-full object-cover opacity-40"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent"></div>
              <div className="absolute bottom-6 left-6 right-6">
                <h1 className="text-white mb-2">{club.name}</h1>
                <p className="text-white/90 text-sm md:text-base mb-4">{club.description}</p>
                <div className="flex flex-wrap items-center gap-4 text-white/90 text-sm">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4" />
                    <span>{club.members.length} members</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4" />
                    <span>{clubPosts.length} posts</span>
                  </div>
                  {adminUser && (
                    <div className="flex items-center gap-2">
                      <Award className="w-4 h-4" />
                      <span>Admin: {adminUser.name}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-3 bg-white shadow-sm border border-gray-200">
            <TabsTrigger value="feed" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary data-[state=active]:to-secondary data-[state=active]:text-white">
              Feed
            </TabsTrigger>
            <TabsTrigger value="events" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary data-[state=active]:to-secondary data-[state=active]:text-white">
              Events
            </TabsTrigger>
            <TabsTrigger value="members" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary data-[state=active]:to-secondary data-[state=active]:text-white">
              Members
            </TabsTrigger>
          </TabsList>

          {/* Feed Tab */}
          <TabsContent value="feed" className="space-y-6">
            {/* Create Post */}
            <Card className="border border-primary/10 shadow-sm">
              <CardContent className="p-4 md:p-6 space-y-4">
                <h3 className="text-gray-900">Share with the community</h3>
                <Textarea
                  placeholder="What's on your mind?"
                  value={newPost}
                  onChange={(e) => setNewPost(e.target.value)}
                  rows={3}
                  className="resize-none"
                />
                <Input
                  placeholder="Add image URL (optional)"
                  value={newPostImage}
                  onChange={(e) => setNewPostImage(e.target.value)}
                />
                {newPostImage && (
                  <div className="rounded-xl overflow-hidden border border-gray-200">
                    <img 
                      src={newPostImage} 
                      alt="Preview" 
                      className="w-full h-48 object-cover"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                  </div>
                )}
                <div className="flex justify-end">
                  <Button 
                    onClick={handleCreatePost}
                    className="bg-gradient-to-r from-primary to-secondary"
                    disabled={!newPost.trim()}
                  >
                    Post
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Posts Feed */}
            <div className="space-y-4">
              {clubPosts.map(post => {
                const author = students.find(s => s.id === post.authorId);
                const isLiked = post.likes.includes(currentUserId);

                return (
                  <Card key={post.id} className={`border overflow-hidden shadow-sm hover:shadow-lg transition-all duration-300 ${post.isPinned ? 'border-primary/30 bg-primary/5' : 'border-primary/10'}`}>
                    <CardContent className="p-4 md:p-6 space-y-4">
                      {/* Post Header */}
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <Avatar className="w-10 h-10 ring-2 ring-primary/20">
                            <AvatarImage src={author?.avatar} />
                            <AvatarFallback>{author?.name[0]}</AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="text-sm font-semibold text-gray-900">{author?.name}</p>
                            <p className="text-xs text-gray-500">{formatDate(post.timestamp)}</p>
                          </div>
                        </div>
                        {post.isPinned && (
                          <Badge className="bg-primary/10 text-primary border-primary/20">
                            <Pin className="w-3 h-3 mr-1" />
                            Pinned
                          </Badge>
                        )}
                      </div>

                      {/* Post Content */}
                      <p className="text-gray-700">{post.content}</p>

                      {/* Post Image */}
                      {post.image && (
                        <div className="rounded-xl overflow-hidden">
                          <ImageWithFallback
                            src={post.image}
                            alt="Post image"
                            className="w-full h-64 md:h-80 object-cover hover:scale-105 transition-transform duration-500"
                          />
                        </div>
                      )}

                      {/* Post Actions */}
                      <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleLikePost(post.id)}
                          className={`${isLiked ? 'text-red-600' : 'text-gray-600'} hover:bg-red-50`}
                        >
                          <Heart className={`w-4 h-4 mr-2 ${isLiked ? 'fill-current' : ''}`} />
                          {post.likes.length}
                        </Button>
                        <Button variant="ghost" size="sm" className="text-gray-600 hover:bg-blue-50">
                          <MessageCircle className="w-4 h-4 mr-2" />
                          {post.comments.length}
                        </Button>
                        <Button variant="ghost" size="sm" className="text-gray-600 hover:bg-gray-50 ml-auto">
                          <Share2 className="w-4 h-4" />
                        </Button>
                      </div>

                      {/* Comments */}
                      {post.comments.length > 0 && (
                        <div className="space-y-3 pt-2">
                          {post.comments.map(comment => {
                            const commentAuthor = students.find(s => s.id === comment.authorId);
                            return (
                              <div key={comment.id} className="flex gap-3 bg-gray-50 rounded-lg p-3">
                                <Avatar className="w-8 h-8">
                                  <AvatarImage src={commentAuthor?.avatar} />
                                  <AvatarFallback>{commentAuthor?.name[0]}</AvatarFallback>
                                </Avatar>
                                <div className="flex-1">
                                  <p className="text-sm font-semibold text-gray-900">{commentAuthor?.name}</p>
                                  <p className="text-sm text-gray-700">{comment.content}</p>
                                  <p className="text-xs text-gray-500 mt-1">{formatDate(comment.timestamp)}</p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </TabsContent>

          {/* Events Tab */}
          <TabsContent value="events" className="space-y-4">
            {clubEvents.map(event => (
              <Card key={event.id} className="border border-primary/10 overflow-hidden shadow-sm hover:shadow-lg transition-all duration-300">
                <div className="md:flex">
                  {event.image && (
                    <div className="md:w-1/3">
                      <ImageWithFallback
                        src={event.image}
                        alt={event.title}
                        className="w-full h-48 md:h-full object-cover"
                      />
                    </div>
                  )}
                  <CardContent className="p-4 md:p-6 space-y-4 flex-1">
                    <div>
                      <Badge className="bg-primary/10 text-primary mb-3">Upcoming</Badge>
                      <h3 className="text-gray-900 mb-2">{event.title}</h3>
                      <p className="text-gray-600 text-sm">{event.description}</p>
                    </div>
                    <div className="space-y-2 text-sm text-gray-600">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-primary" />
                        <span>{formatEventDate(event.date)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4 text-primary" />
                        <span>{event.location}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4 text-primary" />
                        <span>{event.attendees.length} attending</span>
                      </div>
                    </div>
                    <Button className="w-full md:w-auto bg-gradient-to-r from-primary to-secondary">
                      Attend Event
                    </Button>
                  </CardContent>
                </div>
              </Card>
            ))}
          </TabsContent>

          {/* Members Tab */}
          <TabsContent value="members" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {clubMembers.map(member => (
                <Card key={member.id} className="border border-primary/10 shadow-sm hover:shadow-lg transition-all duration-300">
                  <CardContent className="p-4 md:p-6">
                    <div className="flex items-center gap-4">
                      <Avatar className="w-14 h-14 ring-2 ring-primary/20">
                        <AvatarImage src={member.avatar} />
                        <AvatarFallback>{member.name[0]}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-gray-900">{member.name}</p>
                          {member.id === club.admin && (
                            <Badge className="bg-primary/10 text-primary text-xs">Admin</Badge>
                          )}
                        </div>
                        <p className="text-sm text-gray-600">{member.branch} • Year {member.year}</p>
                        <div className="flex flex-wrap gap-1 mt-2">
                          {member.skills.slice(0, 3).map(skill => (
                            <Badge key={skill} variant="outline" className="text-xs">
                              {skill}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <Button variant="outline" size="sm" className="hover:bg-primary/5" onClick={() => onViewProfile?.(member.id)}>
                        View Profile
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}