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
import type { FollowGraph } from '../lib/mockFollows';
import { FollowButton } from './network/FollowButton';
import { useAuth } from '../context/AuthContext';
import { apiAddUserSkill, apiDeleteUserSkill, apiFetchUserSkills, type UserSkill } from '../lib/skillsApi';
import {
  apiCreateUserCertification,
  apiFetchUserCertifications,
  type UserCertification,
} from '../lib/certificationsApi';
import {
  apiCreateUserProject,
  apiDeleteUserProject,
  apiFetchUserProjects,
  type UserProject,
} from '../lib/projectsApi';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { Card, CardContent, CardHeader } from './ui/card';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { ImageWithFallback } from './figma/ImageWithFallback';

interface ProfilePageProps {
  student: Student;
  currentUserId: string;
  isOwnProfile: boolean;

  followGraph: FollowGraph;
  onFollow: (targetUserId: string) => void;
  onUnfollow: (targetUserId: string) => void;
  onCancelRequest: (targetUserId: string) => void;

  onEdit?: (updates: Partial<Student>) => void;
  opportunities?: Opportunity[];
  onLike?: (opportunityId: string) => void;
  onSave?: (opportunityId: string) => void;
  onComment?: (opportunityId: string, comment: string) => void;
}

export function ProfilePage({ student, isOwnProfile, onEdit, opportunities, onLike, onSave, onComment, currentUserId, followGraph, onFollow, onUnfollow, onCancelRequest,}: ProfilePageProps) {
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

  // Certifications are backend-driven for the authenticated user's profile.
  const [loadedCertifications, setLoadedCertifications] = useState<UserCertification[]>(student.certifications);
  const [certificationsLoading, setCertificationsLoading] = useState(false);
  const [newCertName, setNewCertName] = useState('');
  const [newCertDescription, setNewCertDescription] = useState('');
  const [newCertImageUrl, setNewCertImageUrl] = useState('');

  // Projects are backend-driven for all profiles.
  const [loadedProjects, setLoadedProjects] = useState<UserProject[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [newProject, setNewProject] = useState({
    title: '',
    description: '',
  });

  // Experience for the authenticated user's profile.
  const [newExperience, setNewExperience] = useState({
    roleTitle: '',
    organization: '',
    duration: '',
    description: '',
  });

  // Societies for the authenticated user's profile.
  const [newSociety, setNewSociety] = useState({
    societyName: '',
    role: '',
    duration: '',
  });

  // Achievements for the authenticated user's profile.
  const [newAchievement, setNewAchievement] = useState({
    title: '',
    year: '',
    description: '',
  });

  const authUserId = auth.currentUser?.id ?? auth.session?.userId;
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

  const loadCertifications = async () => {
    if (!student.id) return; // Ensure we have a student ID to fetch for

    setCertificationsLoading(true);
    try {
      const list = await apiFetchUserCertifications(student.id, authToken);
      setLoadedCertifications(list);
      if (isOwnProfile && onEdit) {
        onEdit({ certifications: list });
      }
    } catch {
      // Silently handle fetch errors - show empty state instead of error
      setLoadedCertifications([]);
    } finally {
      setCertificationsLoading(false);
    }
  };

  const loadProjects = async () => {
    if (!student.id) return;

    setProjectsLoading(true);
    try {
      const list = await apiFetchUserProjects(student.id, authToken);
      setLoadedProjects(list);
    } catch {
      // Silently handle fetch errors - show empty state instead of error
      setLoadedProjects([]);
    } finally {
      setProjectsLoading(false);
    }
  };

  useEffect(() => {
    if (isOwnProfile && authUserId) {
      loadSkills();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOwnProfile, authUserId, authToken]);

  useEffect(() => {
    loadCertifications();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [student.id, authToken]);

  useEffect(() => {
    loadProjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [student.id, authToken]);

  const followersCount = (followGraph.followersByUserId[student.id] ?? []).length;
  const followingCount = (followGraph.followingByUserId[student.id] ?? []).length;

  const isFollowing = (followGraph.followingByUserId[currentUserId] ?? []).includes(student.id);
  const isFollower = (followGraph.followersByUserId[currentUserId] ?? []).includes(student.id);
  const requestStatus = (followGraph.outgoingRequestsByUserId[currentUserId] ?? []).includes(student.id)
    ? 'requested'
    : 'none';

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

  const handleAddCertification = async () => {
    if (!isOwnProfile || !authUserId) return;

    const name = newCertName.trim();
    const description = newCertDescription.trim();
    const imageUrl = newCertImageUrl.trim();

    if (!name) return;

    try {
      await apiCreateUserCertification(
        authUserId,
        {
          name,
          description: description || undefined,
          imageUrl: imageUrl || undefined,
        },
        authToken
      );

      setNewCertName('');
      setNewCertDescription('');
      setNewCertImageUrl('');

      loadCertifications();
    } catch {
      // Silently handle error - user can retry
    }
  };

  const handleAddProject = async () => {
    if (!isOwnProfile || !authUserId) return;

    const { title, description } = newProject;
    if (!title.trim() || !description.trim()) {
      return;
    }

    try {
      await apiCreateUserProject(
        authUserId,
        {
          title: title.trim(),
          description: description.trim(),
        },
        authToken
      );
      setNewProject({ title: '', description: '' });
      loadProjects();
    } catch {
      // Silently handle error - user can retry
    }
  };

  const handleRemoveProject = async (projectId: string) => {
    if (!isOwnProfile || !authUserId) return;

    try {
      await apiDeleteUserProject(authUserId, projectId, authToken);
      loadProjects();
    } catch {
      // Silently handle error - user can retry
    }
  };

  const handleAddExperience = () => {
    if (!isOwnProfile) return;

    const { roleTitle, organization, duration, description } = newExperience;
    if (!roleTitle.trim() || !organization.trim() || !duration.trim() || !description.trim()) {
      return;
    }

    const id = `exp-${Date.now()}`; // Simple unique ID generation for mock data
    const updatedExperience = [
      ...(editedStudent.experience || []),
      { id, roleTitle: roleTitle.trim(), organization: organization.trim(), duration: duration.trim(), description: description.trim() },
    ];

    setEditedStudent({ ...editedStudent, experience: updatedExperience });
    setNewExperience({ roleTitle: '', organization: '', duration: '', description: '' });
  };

  const handleRemoveExperience = (experienceId: string) => {
    if (!isOwnProfile) return;

    const updatedExperience = (editedStudent.experience || []).filter(
      (exp) => exp.id !== experienceId
    );
    setEditedStudent({ ...editedStudent, experience: updatedExperience });
  };

  const handleAddSociety = () => {
    if (!isOwnProfile) return;

    const { societyName, role, duration } = newSociety;
    if (!societyName.trim() || !role.trim() || !duration.trim()) {
      return;
    }

    const id = `soc-${Date.now()}`; // Simple unique ID generation for mock data
    const updatedSocieties = [
      ...(editedStudent.societies || []),
      { id, societyName: societyName.trim(), role: role.trim(), duration: duration.trim() },
    ];

    setEditedStudent({ ...editedStudent, societies: updatedSocieties });
    setNewSociety({ societyName: '', role: '', duration: '' });
  };

  const handleRemoveSociety = (societyId: string) => {
    if (!isOwnProfile) return;

    const updatedSocieties = (editedStudent.societies || []).filter(
      (soc) => soc.id !== societyId
    );
    setEditedStudent({ ...editedStudent, societies: updatedSocieties });
  };

  const handleAddAchievement = () => {
    if (!isOwnProfile) return;

    const { title, year, description } = newAchievement;
    if (!title.trim() || !year.trim()) {
      return;
    }

    const id = `ach-${Date.now()}`; // Simple unique ID generation for mock data
    const parsedYear = parseInt(year.trim(), 10);
    if (isNaN(parsedYear)) {
      // Optionally show an error to the user about invalid year
      return;
    }

    const updatedAchievements = [
      ...(editedStudent.achievements || []),
      {
        id,
        title: title.trim(),
        year: parsedYear,
        description: description?.trim() || undefined,
      },
    ];

    setEditedStudent({ ...editedStudent, achievements: updatedAchievements });
    setNewAchievement({ title: '', year: '', description: '' });
  };

  const handleRemoveAchievement = (achievementId: string) => {
    if (!isOwnProfile) return;

    const updatedAchievements = (editedStudent.achievements || []).filter(
      (ach) => ach.id !== achievementId
    );
    setEditedStudent({ ...editedStudent, achievements: updatedAchievements });
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
                      <>
                        <Input
                          value={editedStudent.name}
                          onChange={(e) => setEditedStudent({ ...editedStudent, name: e.target.value })}
                          className="mb-2"
                        />
                        <Input
                          value={editedStudent.headline || ''}
                          onChange={(e) => setEditedStudent({ ...editedStudent, headline: e.target.value })}
                          placeholder="Add a headline (e.g., ML Enthusiast | Python Developer)"
                          className="mb-2 text-sm"
                        />
                      </>
                    ) : (
                      <>
                        <h1 className="text-gray-900">{student.name}</h1>
                        {student.headline && (
                          <p className="text-sm text-gray-500 mt-1 font-medium">{student.headline}</p>
                        )}
                      </>
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
                  <div className="flex gap-2">
                    {isOwnProfile ? (
                      isEditing ? (
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
                      )
                    ) : (
                      <FollowButton
                        targetName={student.name}
                        accountType={student.accountType}
                        isFollowing={isFollowing}
                        isFollower={isFollower}
                        requestStatus={requestStatus}
                        onFollow={() => onFollow(student.id)}
                        onUnfollow={() => onUnfollow(student.id)}
                        onCancelRequest={() => onCancelRequest(student.id)}
                      />
                    )}
                  </div>
                </div>

                {/* Bio - This section is moved to its own card below */}

                {/* Resume */}
                {student.resumeUrl && (
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm">
                      <Download className="w-4 h-4 mr-2" />
                      Download Resume
                    </Button>
                  </div>
                )}

                {/* Social Stats */}
                <div className="flex gap-6 pt-2">
                  <div>
                    <p className="text-gray-900">{followersCount}</p>
                    <p className="text-sm text-gray-600">Followers</p>
                  </div>
                  <div>
                    <p className="text-gray-900">{followingCount}</p>
                    <p className="text-sm text-gray-600">Following</p>
                  </div>
                  <div>
                    <p className="text-gray-900">{loadedProjects.length}</p>
                    <p className="text-sm text-gray-600">Projects</p>
                  </div>
                  <div>
                    <p className="text-gray-900">{loadedCertifications.length}</p>
                    <p className="text-sm text-gray-600">Certifications</p>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* About Card */}
        <Card>
          <CardHeader>
            <h2 className="text-gray-900">About</h2>
          </CardHeader>
          <CardContent>
            {isEditing ? (
              <Textarea
                value={editedStudent.bio || ''}
                onChange={(e) => setEditedStudent({ ...editedStudent, bio: e.target.value })}
                rows={4}
                maxLength={250}
                placeholder="Write a short introduction about yourself..."
              />
            ) : (
              <p className="text-gray-600">
                {student.bio || 'Write a short introduction about yourself...'}
              </p>
            )}
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
        <Card>
          <CardHeader>
            <h2 className="text-gray-900">Certifications</h2>
          </CardHeader>
          <CardContent>
            {certificationsLoading ? (
              <p className="text-sm text-gray-500">Loading certifications…</p>
            ) : loadedCertifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <p className="text-4xl mb-3">🏆</p>
                <h3 className="text-lg font-semibold text-gray-900 mb-1">No Certifications Added</h3>
                <p className="text-sm text-gray-500 mb-4">Add your certifications to showcase your achievements.</p>
                {isOwnProfile && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsEditing(true)}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add Certification
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {loadedCertifications.map((cert) => (
                  <div key={cert.id} className="p-4 border rounded-lg space-y-2">
                    <p className="text-gray-900">{cert.name}</p>
                    {cert.description && (
                      <p className="text-sm text-gray-600">{cert.description}</p>
                    )}
                    {cert.imageUrl && (
                      <a
                        href={cert.imageUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-blue-600 hover:text-blue-700 hover:underline"
                      >
                        View certificate
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}

            {isOwnProfile && isEditing && (
              <div className="mt-4 space-y-3">
                <Input
                  value={newCertName}
                  onChange={(e) => setNewCertName(e.target.value)}
                  placeholder="Certification name"
                />
                <Textarea
                  value={newCertDescription}
                  onChange={(e) => setNewCertDescription(e.target.value)}
                  placeholder="Description"
                  rows={3}
                />
                <Input
                  value={newCertImageUrl}
                  onChange={(e) => setNewCertImageUrl(e.target.value)}
                  placeholder="Certificate image URL"
                />
                <Button
                  type="button"
                  size="sm"
                  onClick={handleAddCertification}
                  disabled={!newCertName.trim()}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Certification
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Projects */}
        <Card>
          <CardHeader>
            <h2 className="text-gray-900">Projects</h2>
          </CardHeader>
          <CardContent>
            {projectsLoading ? (
              <p className="text-sm text-gray-500">Loading projects…</p>
            ) : loadedProjects.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <h3 className="text-lg font-semibold text-gray-900 mb-1">No Projects Yet</h3>
                <p className="text-sm text-gray-500 mb-4">Add your academic or personal projects to showcase your skills.</p>
                {isOwnProfile && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsEditing(true)}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add Project
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {loadedProjects.map((project) => (
                  <div key={project.id} className="p-4 border rounded-lg space-y-2 relative">
                    {isOwnProfile && isEditing && (
                       <Button
                         type="button"
                         variant="ghost"
                         size="sm"
                         onClick={() => handleRemoveProject(project.id)}
                         className="absolute top-2 right-2 text-gray-500 hover:text-red-600"
                         aria-label={`Remove ${project.title}`}
                       >
                         <X className="w-4 h-4" />
                       </Button>
                    )}
                    <div className="flex items-start justify-between">
                      <h3 className="text-gray-900">{project.title}</h3>
                      {project.link && (
                        <a
                          href={project.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:text-blue-700"
                        >
                          <ExternalLink className="w-5 h-5" />
                        </a>
                      )}
                    </div>
                    {project.imageUrl && (
                       <ImageWithFallback src={project.imageUrl} alt={project.title} className="w-full h-48 object-cover rounded-md" />
                    )}
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
              </div>
            )}

            {isOwnProfile && isEditing && (
              <div className="mt-6 p-4 border rounded-lg space-y-3">
                <h3 className="text-gray-900">Add Project</h3>
                <Input
                  value={newProject.title}
                  onChange={(e) => setNewProject({ ...newProject, title: e.target.value })}
                  placeholder="Title"
                />
                <Textarea
                  value={newProject.description}
                  onChange={(e) => setNewProject({ ...newProject, description: e.target.value })}
                  placeholder="Description"
                  rows={3}
                />
                <Input
                  type="file"
                  accept="image/*"
                  disabled // UI only as per request
                  className="text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                />
                <Button type="button" onClick={handleAddProject} disabled={!newProject.title.trim() || !newProject.description.trim()}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Project
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Experience */}
        <Card>
          <CardHeader>
            <h2 className="text-gray-900">Experience</h2>
          </CardHeader>
          <CardContent>
            {(editedStudent.experience || []).length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <h3 className="text-lg font-semibold text-gray-900 mb-1">No experience added yet.</h3>
                <p className="text-sm text-gray-500 mb-4">Showcase your professional journey and accomplishments.</p>
                {isOwnProfile && isEditing && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => { /* This button will trigger the add form */ }}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add Experience
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {(editedStudent.experience || []).map((exp) => (
                  <div key={exp.id} className="p-4 border rounded-lg space-y-1 relative">
                    {isOwnProfile && isEditing && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveExperience(exp.id)}
                        className="absolute top-2 right-2 text-gray-500 hover:text-red-600"
                        aria-label={`Remove ${exp.roleTitle}`}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    )}
                    <h3 className="text-gray-900">{exp.roleTitle}</h3>
                    <p className="text-sm text-gray-700 font-medium">{exp.organization}</p>
                    <p className="text-xs text-gray-500">{exp.duration}</p>
                    <p className="text-gray-600">{exp.description}</p>
                  </div>
                ))}
              </div>
            )}

            {isOwnProfile && isEditing && (
              <div className="mt-6 p-4 border rounded-lg space-y-3">
                <h3 className="text-gray-900">Add New Experience</h3>
                <Input
                  value={newExperience.roleTitle}
                  onChange={(e) => setNewExperience({ ...newExperience, roleTitle: e.target.value })}
                  placeholder="Role Title (e.g., Software Engineer Intern)"
                />
                <Input
                  value={newExperience.organization}
                  onChange={(e) => setNewExperience({ ...newExperience, organization: e.target.value })}
                  placeholder="Organization (e.g., Google)"
                />
                <Input
                  value={newExperience.duration}
                  onChange={(e) => setNewExperience({ ...newExperience, duration: e.target.value })}
                  placeholder="Duration (e.g., May 2023 - Aug 2023)"
                />
                <Textarea
                  value={newExperience.description}
                  onChange={(e) => setNewExperience({ ...newExperience, description: e.target.value })}
                  placeholder="Short Description of Responsibilities and Achievements"
                  rows={3}
                />
                <Button
                  type="button"
                  onClick={handleAddExperience}
                  disabled={!newExperience.roleTitle.trim() || !newExperience.organization.trim() || !newExperience.duration.trim() || !newExperience.description.trim()}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Experience
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Societies & Clubs */}
        <Card>
          <CardHeader>
            <h2 className="text-gray-900">Societies & Clubs</h2>
          </CardHeader>
          <CardContent>
            {(editedStudent.societies || []).length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <h3 className="text-lg font-semibold text-gray-900 mb-1">No societies joined yet.</h3>
                <p className="text-sm text-gray-500 mb-4">Join a society or club to connect with peers and enrich your campus life.</p>
                {isOwnProfile && isEditing && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => { /* This button will trigger the add form */ }}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add Society
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {(editedStudent.societies || []).map((soc) => (
                  <div key={soc.id} className="p-4 border rounded-lg space-y-1 relative">
                    {isOwnProfile && isEditing && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveSociety(soc.id)}
                        className="absolute top-2 right-2 text-gray-500 hover:text-red-600"
                        aria-label={`Remove ${soc.societyName}`}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    )}
                    <h3 className="text-gray-900">{soc.societyName}</h3>
                    <p className="text-sm text-gray-700 font-medium">{soc.role}</p>
                    <p className="text-xs text-gray-500">{soc.duration}</p>
                  </div>
                ))}
              </div>
            )}

            {isOwnProfile && isEditing && (
              <div className="mt-6 p-4 border rounded-lg space-y-3">
                <h3 className="text-gray-900">Add New Society/Club</h3>
                <Input
                  value={newSociety.societyName}
                  onChange={(e) => setNewSociety({ ...newSociety, societyName: e.target.value })}
                  placeholder="Society/Club Name (e.g., Google Developers Club)"
                />
                <Input
                  value={newSociety.role}
                  onChange={(e) => setNewSociety({ ...newSociety, role: e.target.value })}
                  placeholder="Role (e.g., Member, Lead, Volunteer)"
                />
                <Input
                  value={newSociety.duration}
                  onChange={(e) => setNewSociety({ ...newSociety, duration: e.target.value })}
                  placeholder="Duration (e.g., Sep 2022 - Present)"
                />
                <Button
                  type="button"
                  onClick={handleAddSociety}
                  disabled={!newSociety.societyName.trim() || !newSociety.role.trim() || !newSociety.duration.trim()}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Society
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Achievements */}
        <Card>
          <CardHeader>
            <h2 className="text-gray-900">Achievements</h2>
          </CardHeader>
          <CardContent>
            {(editedStudent.achievements || []).length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <h3 className="text-lg font-semibold text-gray-900 mb-1">No achievements added yet.</h3>
                <p className="text-sm text-gray-500 mb-4">Showcase your accomplishments and milestones.</p>
                {isOwnProfile && isEditing && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => { /* This button will trigger the add form */ }}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add Achievement
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {(editedStudent.achievements || []).map((ach) => (
                  <div key={ach.id} className="p-4 border rounded-lg space-y-1 relative">
                    {isOwnProfile && isEditing && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveAchievement(ach.id)}
                        className="absolute top-2 right-2 text-gray-500 hover:text-red-600"
                        aria-label={`Remove ${ach.title}`}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    )}
                    <h3 className="text-gray-900">{ach.title}</h3>
                    <p className="text-sm text-gray-700 font-medium">{ach.year}</p>
                    {ach.description && <p className="text-gray-600">{ach.description}</p>}
                  </div>
                ))}
              </div>
            )}

            {isOwnProfile && isEditing && (
              <div className="mt-6 p-4 border rounded-lg space-y-3">
                <h3 className="text-gray-900">Add New Achievement</h3>
                <Input
                  value={newAchievement.title}
                  onChange={(e) => setNewAchievement({ ...newAchievement, title: e.target.value })}
                  placeholder="Achievement Title (e.g., Hackathon Winner)"
                />
                <Input
                  value={newAchievement.year}
                  onChange={(e) => setNewAchievement({ ...newAchievement, year: e.target.value })}
                  placeholder="Year (e.g., 2024)"
                  type="number"
                />
                <Textarea
                  value={newAchievement.description}
                  onChange={(e) => setNewAchievement({ ...newAchievement, description: e.target.value })}
                  placeholder="Optional Description"
                  rows={2}
                />
                <Button
                  type="button"
                  onClick={handleAddAchievement}
                  disabled={!newAchievement.title.trim() || !newAchievement.year.trim()}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Achievement
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

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