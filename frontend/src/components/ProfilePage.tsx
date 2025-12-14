import { useEffect, useState } from 'react';
import {
  Mail,
  GraduationCap,
  Calendar,
  MapPin,
  Edit2,
  Download,
  Upload,
  ExternalLink,
  Plus,
  X,
  Heart,
  MessageCircle,
  Share2,
  Bookmark,
} from 'lucide-react';
import { Student, Opportunity } from '../types';
import { useAuth } from '../context/AuthContext';
import { apiAddUserSkill, apiDeleteUserSkill, apiFetchUserSkills, type UserSkill } from '../lib/skillsApi';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { Card, CardContent, CardHeader } from './ui/card';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { ImageWithFallback } from './figma/ImageWithFallback';

interface ProfilePageProps {
  student: Student;
  isOwnProfile: boolean;
  onEdit?: (updates: Partial<Student>) => void;
  opportunities?: Opportunity[];
  onLike?: (opportunityId: string) => void;
  onSave?: (opportunityId: string) => void;
  onComment?: (opportunityId: string, comment: string) => void;
}

export function ProfilePage({ student, isOwnProfile, onEdit, opportunities, onLike, onSave, onComment }: ProfilePageProps) {
  const auth = useAuth();

  const [isEditing, setIsEditing] = useState(false);
  const [editedStudent, setEditedStudent] = useState(student);
  const [commentText, setCommentText] = useState<{ [key: string]: string }>({});
  const [showComments, setShowComments] = useState<{ [key: string]: boolean }>({});

  // Skills are backend-driven for the authenticated user's profile.
  const [skills, setSkills] = useState<UserSkill[]>([]);
  const [skillsLoading, setSkillsLoading] = useState(false);
  const [skillsError, setSkillsError] = useState<string | null>(null);
  const [newSkillName, setNewSkillName] = useState('');

  const authUserId = auth.session?.userId;
  const authToken = auth.session?.token;

  // Filter posts by this user
  const userPosts = opportunities?.filter((opp) => opp.authorId === student.id) || [];

  const loadSkills = async () => {
    if (!isOwnProfile || !authUserId) return;

    setSkillsLoading(true);
    setSkillsError(null);
    try {
      const list = await apiFetchUserSkills(authUserId, authToken);
      setSkills(list);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unable to load skills';
      setSkillsError(message);
    } finally {
      setSkillsLoading(false);
    }
  };

  useEffect(() => {
    loadSkills();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOwnProfile, authUserId, authToken]);

  const handleSave = () => {
    if (onEdit) {
      onEdit(editedStudent);
    }
    setIsEditing(false);
  };

  const handleAddSkill = async () => {
    if (!isOwnProfile || !authUserId) return;

    const name = newSkillName.trim();
    if (!name) return;

    setSkillsError(null);
    try {
      await apiAddUserSkill(authUserId, name, authToken);
      setNewSkillName('');
      await loadSkills();
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unable to add skill';
      setSkillsError(message);
    }
  };

  const handleRemoveSkill = async (skillId: string) => {
    if (!isOwnProfile || !authUserId) return;

    setSkillsError(null);
    try {
      await apiDeleteUserSkill(authUserId, skillId, authToken);
      await loadSkills();
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unable to remove skill';
      setSkillsError(message);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50/30 to-purple-50/30 animate-fade-in pb-20 md:pb-0">
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Header Card */}
        <Card>
          <CardContent className="p-6">
            <div className="flex flex-col md:flex-row gap-6">
              {/* Avatar */}
              <div className="flex flex-col items-center gap-3">
                <Avatar className="w-32 h-32">
                  <AvatarImage src={student.avatar} />
                  <AvatarFallback className="text-3xl">{student.name[0]}</AvatarFallback>
                </Avatar>
                {isOwnProfile && (
                  <Button variant="outline" size="sm">
                    <Upload className="w-4 h-4 mr-2" />
                    Upload Photo
                  </Button>
                )}
              </div>

              {/* Info */}
              <div className="flex-1 space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    {isEditing ? (
                      <Input
                        value={editedStudent.name}
                        onChange={(e) => setEditedStudent({ ...editedStudent, name: e.target.value })}
                        className="mb-2"
                      />
                    ) : (
                      <h1 className="text-gray-900">{student.name}</h1>
                    )}
                    <div className="flex flex-wrap gap-3 mt-2 text-gray-600">
                      <div className="flex items-center gap-1">
                        <GraduationCap className="w-4 h-4" />
                        <span>{student.branch}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Calendar className="w-4 h-4" />
                        <span>Year {student.year}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Mail className="w-4 h-4" />
                        <span>{student.email}</span>
                      </div>
                    </div>
                  </div>
                  {isOwnProfile && (
                    <div className="flex gap-2">
                      {isEditing ? (
                        <>
                          <Button onClick={handleSave} size="sm">Save</Button>
                          <Button onClick={() => setIsEditing(false)} variant="outline" size="sm">
                            Cancel
                          </Button>
                        </>
                      ) : (
                        <Button onClick={() => setIsEditing(true)} variant="outline" size="sm">
                          <Edit2 className="w-4 h-4 mr-2" />
                          Edit Profile
                        </Button>
                      )}
                    </div>
                  )}
                </div>

                {/* Bio */}
                {isEditing ? (
                  <Textarea
                    value={editedStudent.bio}
                    onChange={(e) => setEditedStudent({ ...editedStudent, bio: e.target.value })}
                    rows={3}
                  />
                ) : (
                  <p className="text-gray-600">{student.bio}</p>
                )}

                {/* Resume */}
                {student.resumeUrl && (
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm">
                      <Download className="w-4 h-4 mr-2" />
                      Download Resume
                    </Button>
                  </div>
                )}

                {/* Connection Stats */}
                <div className="flex gap-6 pt-2">
                  <div>
                    <p className="text-gray-900">{student.connections.length}</p>
                    <p className="text-sm text-gray-600">Connections</p>
                  </div>
                  <div>
                    <p className="text-gray-900">{student.projects.length}</p>
                    <p className="text-sm text-gray-600">Projects</p>
                  </div>
                  <div>
                    <p className="text-gray-900">{student.certifications.length}</p>
                    <p className="text-sm text-gray-600">Certifications</p>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Skills */}
        <Card>
          <CardHeader>
            <h2 className="text-gray-900">Skills</h2>
          </CardHeader>
          <CardContent>
            {isOwnProfile ? (
              <>
                {skillsError && (
                  <p className="text-sm text-red-600 mb-3">
                    {skillsError}
                  </p>
                )}

                <div className="flex flex-wrap gap-2">
                  {skillsLoading ? (
                    <p className="text-sm text-gray-500">Loading skills…</p>
                  ) : (
                    skills.map((skill) => (
                      <Badge key={skill.id} className="bg-blue-100 text-blue-800">
                        {skill.name}
                        {isEditing && (
                          <button
                            onClick={() => handleRemoveSkill(skill.id)}
                            className="ml-2 hover:text-blue-900"
                            aria-label={`Remove ${skill.name}`}
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </Badge>
                    ))
                  )}
                </div>

                {isEditing && (
                  <div className="flex gap-2 mt-4">
                    <Input
                      value={newSkillName}
                      onChange={(e) => setNewSkillName(e.target.value)}
                      placeholder="Add a skill"
                    />
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleAddSkill}
                      disabled={!newSkillName.trim()}
                    >
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                )}
              </>
            ) : (
              <div className="flex flex-wrap gap-2">
                {student.skills.map((skill) => (
                  <Badge key={skill} className="bg-blue-100 text-blue-800">
                    {skill}
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Interests */}
        <Card>
          <CardHeader>
            <h2 className="text-gray-900">Interests</h2>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {student.interests.map((interest) => (
                <Badge key={interest} className="bg-purple-100 text-purple-800">
                  {interest}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Certifications */}
        {student.certifications.length > 0 && (
          <Card>
            <CardHeader>
              <h2 className="text-gray-900">Certifications</h2>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {student.certifications.map((cert, index) => (
                  <li key={index} className="flex items-center gap-2 text-gray-700">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    {cert}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {/* Projects */}
        {student.projects.length > 0 && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <h2 className="text-gray-900">Projects</h2>
              {isOwnProfile && (
                <Button variant="outline" size="sm">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Project
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              {student.projects.map((project) => (
                <div key={project.id} className="p-4 border rounded-lg space-y-2">
                  <div className="flex items-start justify-between">
                    <h3 className="text-gray-900">{project.title}</h3>
                    <a
                      href={project.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:text-blue-700"
                    >
                      <ExternalLink className="w-5 h-5" />
                    </a>
                  </div>
                  <p className="text-gray-600">{project.description}</p>
                  <div className="flex flex-wrap gap-2">
                    {project.tags.map((tag) => (
                      <Badge key={tag} variant="outline">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* User Posts */}
        {userPosts.length > 0 && (
          <Card>
            <CardHeader>
              <h2 className="text-gray-900">
                {isOwnProfile ? 'My Posts' : `Posts by ${student.name}`}
              </h2>
              <p className="text-sm text-gray-500">{userPosts.length} post{userPosts.length !== 1 ? 's' : ''}</p>
            </CardHeader>
            <CardContent className="space-y-4">
              {userPosts.map((post) => {
                const isLiked = onLike && post.likes.includes('current');
                const isSaved = onSave && post.saved.includes('current');

                return (
                  <Card key={post.id} className="border border-primary/10 hover:shadow-lg transition-all duration-300">
                    <CardContent className="p-4 md:p-6 space-y-4">
                      {/* Post Header */}
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <Badge className={`
                              ${post.type === 'internship' ? 'bg-blue-100 text-blue-800' : ''}
                              ${post.type === 'event' ? 'bg-purple-100 text-purple-800' : ''}
                              ${post.type === 'hackathon' ? 'bg-green-100 text-green-800' : ''}
                            `}>
                              {post.type.toUpperCase()}
                            </Badge>
                            <span className="text-xs text-gray-500">
                              {new Date(post.date).toLocaleDateString('en-US', { 
                                month: 'short', 
                                day: 'numeric',
                                year: 'numeric'
                              })}
                            </span>
                          </div>
                          <h3 className="text-gray-900">{post.title}</h3>
                          {post.location && (
                            <div className="flex items-center gap-1 mt-1 text-sm text-gray-600">
                              <MapPin className="w-3 h-3" />
                              <span>{post.location}</span>
                            </div>
                          )}
                        </div>
                        {onSave && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onSave(post.id)}
                            className={isSaved ? 'text-primary' : 'text-gray-400'}
                          >
                            <Bookmark className={`w-5 h-5 ${isSaved ? 'fill-current' : ''}`} />
                          </Button>
                        )}
                      </div>

                      {/* Post Description */}
                      <p className="text-gray-700">{post.description}</p>

                      {/* Post Image */}
                      {post.image && (
                        <div className="rounded-xl overflow-hidden">
                          <ImageWithFallback
                            src={post.image}
                            alt={post.title}
                            className="w-full h-64 object-cover hover:scale-105 transition-transform duration-500"
                          />
                        </div>
                      )}

                      {/* Post Link */}
                      {post.link && (
                        <a
                          href={post.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 text-primary hover:underline text-sm"
                        >
                          <ExternalLink className="w-4 h-4" />
                          Learn more
                        </a>
                      )}

                      {/* Post Actions */}
                      <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
                        {onLike && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onLike(post.id)}
                            className={`${isLiked ? 'text-red-600' : 'text-gray-600'} hover:bg-red-50`}
                          >
                            <Heart className={`w-4 h-4 mr-2 ${isLiked ? 'fill-current' : ''}`} />
                            {post.likes.length}
                          </Button>
                        )}
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="text-gray-600 hover:bg-blue-50"
                          onClick={() => setShowComments({ ...showComments, [post.id]: !showComments[post.id] })}
                        >
                          <MessageCircle className="w-4 h-4 mr-2" />
                          {post.comments.length}
                        </Button>
                        <Button variant="ghost" size="sm" className="text-gray-600 hover:bg-gray-50 ml-auto">
                          <Share2 className="w-4 h-4" />
                        </Button>
                      </div>

                      {/* Comments Section */}
                      {showComments[post.id] && (
                        <div className="space-y-3 pt-3 border-t border-gray-100">
                          {post.comments.map((comment) => (
                            <div key={comment.id} className="flex gap-3">
                              <Avatar className="w-8 h-8">
                                <AvatarImage src={comment.authorAvatar} />
                                <AvatarFallback>{comment.authorName[0]}</AvatarFallback>
                              </Avatar>
                              <div className="flex-1 bg-gray-50 rounded-lg p-3">
                                <p className="text-sm font-semibold text-gray-900">{comment.authorName}</p>
                                <p className="text-sm text-gray-700">{comment.content}</p>
                                <p className="text-xs text-gray-500 mt-1">
                                  {new Date(comment.timestamp).toLocaleDateString('en-US', { 
                                    month: 'short', 
                                    day: 'numeric',
                                    hour: 'numeric',
                                    minute: '2-digit'
                                  })}
                                </p>
                              </div>
                            </div>
                          ))}
                          
                          {/* Add Comment */}
                          {onComment && (
                            <div className="flex gap-2 pt-2">
                              <Input
                                placeholder="Write a comment..."
                                value={commentText[post.id] || ''}
                                onChange={(e) => setCommentText({ ...commentText, [post.id]: e.target.value })}
                                onKeyPress={(e) => {
                                  if (e.key === 'Enter' && commentText[post.id]?.trim()) {
                                    onComment(post.id, commentText[post.id]);
                                    setCommentText({ ...commentText, [post.id]: '' });
                                  }
                                }}
                              />
                              <Button
                                size="sm"
                                onClick={() => {
                                  if (commentText[post.id]?.trim()) {
                                    onComment(post.id, commentText[post.id]);
                                    setCommentText({ ...commentText, [post.id]: '' });
                                  }
                                }}
                                disabled={!commentText[post.id]?.trim()}
                              >
                                Post
                              </Button>
                            </div>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}