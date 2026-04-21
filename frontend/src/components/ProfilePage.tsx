import { useEffect, useState, useRef } from 'react';
import { format } from 'date-fns';
import {
  Mail,
  GraduationCap,
  Calendar,
  MapPin,
  Edit2,
  Download,
  ExternalLink,
  Plus,
  X,
  Heart,
  MessageCircle,
  Share2,
  Bookmark,
  Briefcase,
  Award,
  Users,
  Trophy,
  Pencil,
  Trash2,
  Github,
  Globe,
  Upload,
  Link as LinkIcon,
  Check,
} from 'lucide-react';
import { Student, Opportunity } from '../types';
import type { FollowGraph } from '../lib/mockFollows';
import { FollowButton } from './network/FollowButton';
import { useAuth } from '../context/AuthContext';
import { apiAddUserSkill, apiDeleteUserSkill, apiFetchUserSkills, type UserSkill } from '../lib/skillsApi';
import {
  apiCreateUserCertification,
  apiFetchUserCertifications,
  apiDeleteUserCertification,
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
import { Card, CardContent } from './ui/card';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Checkbox } from './ui/checkbox';
import { Modal } from './ui/modal';
import { DatePicker } from './ui/date-picker';
import { ImageWithFallback } from './figma/ImageWithFallback';
import { ProfilePhotoUpload } from './ui/profile-photo-upload';
import { apiUpdateUserProfilePicture, apiUploadUserProfilePicture } from '../lib/authApi';

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

// Experience type with dates
interface Experience {
  id: string;
  roleTitle: string;
  organization: string;
  startDate: Date;
  endDate?: Date;
  isCurrentlyWorking: boolean;
  description: string;
}

// Society type with dates
interface Society {
  id: string;
  societyName: string;
  role: string;
  startDate: Date;
  endDate?: Date;
  duration?: string;
}

// Achievement type
interface Achievement {
  id: string;
  title: string;
  year: number;
  description?: string;
}

// Project type with image
interface Project {
  id: string;
  title: string;
  description: string;
  imageUrl?: string;
  githubUrl?: string;
  liveUrl?: string;
  tags: string[];
}

// Certification with dates
interface Certification {
  id: string;
  name: string;
  issuer?: string;
  issueDate?: Date;
  imageUrl?: string;
  certificateUrl?: string;
  description?: string;
}

export function ProfilePage({
  student,
  isOwnProfile,
  onEdit,
  opportunities,
  onLike,
  onSave,
  onComment,
  currentUserId,
  followGraph,
  onFollow,
  onUnfollow,
  onCancelRequest,
}: ProfilePageProps) {
  const auth = useAuth();

  // Profile state
  const [editedStudent, setEditedStudent] = useState(student);

  // Skills state
  const [skills, setSkills] = useState<UserSkill[]>([]);
  const [skillsLoading, setSkillsLoading] = useState(false);
  const [newSkillName, setNewSkillName] = useState('');

  // Certifications state
  const [loadedCertifications, setLoadedCertifications] = useState<Certification[]>([]);
  const [certificationsLoading, setCertificationsLoading] = useState(false);

  // Projects state
  const [loadedProjects, setLoadedProjects] = useState<Project[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);

  // Experience state
  const [experiences, setExperiences] = useState<Experience[]>([]);

  // Societies state
  const [societies, setSocieties] = useState<Society[]>([]);

  // Achievements state
  const [achievements, setAchievements] = useState<Achievement[]>([]);

  // Modal states
  const [activeModal, setActiveModal] = useState<
    'editProfile' | 'about' | 'skill' | 'experience' | 'project' | 'certification' | 'society' | 'achievement' | null
  >(null);

  // Edit item states (for editing existing items)
  const [editingItem, setEditingItem] = useState<string | null>(null);

  // Form states
  const [newExperience, setNewExperience] = useState<Partial<Experience>>({
    roleTitle: '',
    organization: '',
    startDate: undefined,
    endDate: undefined,
    isCurrentlyWorking: false,
    description: '',
  });

  const [newProject, setNewProject] = useState<Partial<Project>>({
    title: '',
    description: '',
    imageUrl: '',
    githubUrl: '',
    liveUrl: '',
    tags: [],
  });
  const [projectImagePreview, setProjectImagePreview] = useState<string | null>(null);
  const [newProjectTag, setNewProjectTag] = useState('');

  const [newCertification, setNewCertification] = useState<Partial<Certification>>({
    name: '',
    issuer: '',
    issueDate: undefined,
    imageUrl: '',
    certificateUrl: '',
    description: '',
  });
  const [certImagePreview, setCertImagePreview] = useState<string | null>(null);

  const [newSociety, setNewSociety] = useState<Partial<Society>>({
    societyName: '',
    role: '',
    startDate: undefined,
    endDate: undefined,
  });

  const [newAchievement, setNewAchievement] = useState<Partial<Achievement>>({
    title: '',
    year: new Date().getFullYear(),
    description: '',
  });

  const authUserId = auth.currentUser?.id ?? auth.session?.userId;
  const authToken = auth.session?.token;

  // Load data
  const loadSkills = async () => {
    if (!isOwnProfile || !authUserId) return;
    setSkillsLoading(true);
    try {
      const list = await apiFetchUserSkills(authUserId, authToken);
      setSkills(list);
    } catch {
      setSkills([]);
    } finally {
      setSkillsLoading(false);
    }
  };

  const loadCertifications = async () => {
    if (!student.id) return;
    setCertificationsLoading(true);
    try {
      const list = await apiFetchUserCertifications(student.id, authToken);
      setLoadedCertifications(list as Certification[]);
    } catch {
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
      setLoadedProjects(list as Project[]);
    } catch {
      setLoadedProjects([]);
    } finally {
      setProjectsLoading(false);
    }
  };

  useEffect(() => {
    if (isOwnProfile && authUserId) {
      loadSkills();
    }
  }, [isOwnProfile, authUserId, authToken]);

  useEffect(() => {
    loadCertifications();
    loadProjects();
  }, [student.id, authToken]);

  useEffect(() => {
    // Initialize from student data
    if (student.experience) {
      setExperiences(student.experience.map(exp => ({
        ...exp,
        startDate: new Date(),
        isCurrentlyWorking: false,
      })) as Experience[]);
    }
    if (student.societies) {
      setSocieties(student.societies.map(soc => ({
        ...soc,
        startDate: new Date(),
      })) as Society[]);
    }
    if (student.achievements) {
      setAchievements(student.achievements as Achievement[]);
    }
  }, [student]);

  // Follow counts
  const followersCount = (followGraph.followersByUserId[student.id] ?? []).length;
  const followingCount = (followGraph.followingByUserId[student.id] ?? []).length;
  const isFollowing = (followGraph.followingByUserId[currentUserId] ?? []).includes(student.id);
  const isFollower = (followGraph.followersByUserId[currentUserId] ?? []).includes(student.id);
  const requestStatus = (followGraph.outgoingRequestsByUserId[currentUserId] ?? []).includes(student.id)
    ? 'requested'
    : 'none';

  // Handlers
  const closeModal = () => {
    setActiveModal(null);
    setEditingItem(null);
    resetForms();
  };

  const resetForms = () => {
    setNewExperience({ roleTitle: '', organization: '', startDate: undefined, endDate: undefined, isCurrentlyWorking: false, description: '' });
    setNewProject({ title: '', description: '', imageUrl: '', githubUrl: '', liveUrl: '', tags: [] });
    setProjectImagePreview(null);
    setNewProjectTag('');
    setNewCertification({ name: '', issuer: '', issueDate: undefined, imageUrl: '', certificateUrl: '', description: '' });
    setCertImagePreview(null);
    setNewSociety({ societyName: '', role: '', startDate: undefined, endDate: undefined });
    setNewAchievement({ title: '', year: new Date().getFullYear(), description: '' });
  };

  const handleSaveProfile = () => {
    if (onEdit) {
      onEdit(editedStudent);
    }
    closeModal();
  };

  const currentProfilePhoto = auth.profile?.profilePictureUrl ?? null;
  const hasCustomProfilePhoto = Boolean(auth.profile?.profilePictureUrl);
  const displayedProfilePhoto = currentProfilePhoto ?? student.avatar;

  const handleProfilePhotoChange = async (payload: { file?: File; previewUrl?: string; remove?: boolean }) => {
    if (!isOwnProfile || !authUserId) return;

    if (payload.remove) {
      await apiUpdateUserProfilePicture(authUserId, null, authToken);
      onEdit?.({ avatar: student.avatar });
      await auth.refreshProfile();
      return;
    }

    if (!payload.file) return;

    await apiUploadUserProfilePicture(authUserId, payload.file, authToken);
    if (payload.previewUrl) {
      onEdit?.({ avatar: payload.previewUrl });
    }
    await auth.refreshProfile();
  };

  // Skill handlers
  const handleAddSkill = async () => {
    if (!isOwnProfile || !authUserId || !newSkillName.trim()) return;
    try {
      await apiAddUserSkill(authUserId, newSkillName.trim(), authToken);
      setNewSkillName('');
      await loadSkills();
      closeModal();
    } catch {}
  };

  const handleRemoveSkill = async (skillId: string) => {
    if (!isOwnProfile || !authUserId) return;
    try {
      await apiDeleteUserSkill(authUserId, skillId, authToken);
      await loadSkills();
    } catch {}
  };

  // Experience handlers
  const handleAddExperience = () => {
    if (!newExperience.roleTitle?.trim() || !newExperience.organization?.trim()) return;
    
    const exp: Experience = {
      id: editingItem || `exp-${Date.now()}`,
      roleTitle: newExperience.roleTitle.trim(),
      organization: newExperience.organization.trim(),
      startDate: newExperience.startDate || new Date(),
      endDate: newExperience.isCurrentlyWorking ? undefined : newExperience.endDate,
      isCurrentlyWorking: newExperience.isCurrentlyWorking || false,
      description: newExperience.description?.trim() || '',
    };

    if (editingItem) {
      setExperiences(experiences.map(e => e.id === editingItem ? exp : e));
    } else {
      setExperiences([...experiences, exp]);
    }
    
    if (onEdit) {
      onEdit({ experience: [...experiences.filter(e => e.id !== editingItem), exp].map(e => ({
        id: e.id,
        roleTitle: e.roleTitle,
        organization: e.organization,
        duration: e.isCurrentlyWorking 
          ? `${format(e.startDate, 'MMM yyyy')} - Present`
          : `${format(e.startDate, 'MMM yyyy')} - ${e.endDate ? format(e.endDate, 'MMM yyyy') : 'Present'}`,
        description: e.description,
      })) });
    }
    closeModal();
  };

  const handleEditExperience = (exp: Experience) => {
    setEditingItem(exp.id);
    setNewExperience(exp);
    setActiveModal('experience');
  };

  const handleDeleteExperience = (id: string) => {
    setExperiences(experiences.filter(e => e.id !== id));
  };

  // Project handlers
  const handleAddProject = async () => {
    if (!newProject.title?.trim() || !newProject.description?.trim()) return;

    const project: Project = {
      id: editingItem || `proj-${Date.now()}`,
      title: newProject.title.trim(),
      description: newProject.description.trim(),
      imageUrl: projectImagePreview || newProject.imageUrl || '',
      githubUrl: newProject.githubUrl || '',
      liveUrl: newProject.liveUrl || '',
      tags: newProject.tags || [],
    };

    if (authUserId && !editingItem) {
      try {
        await apiCreateUserProject(authUserId, {
          title: project.title,
          description: project.description,
        }, authToken);
        await loadProjects();
      } catch {}
    } else if (editingItem) {
      setLoadedProjects(loadedProjects.map(p => p.id === editingItem ? project : p));
    }
    closeModal();
  };

  const handleEditProject = (project: Project) => {
    setEditingItem(project.id);
    setNewProject(project);
    setProjectImagePreview(project.imageUrl || null);
    setActiveModal('project');
  };

  const handleDeleteProject = async (id: string) => {
    if (!authUserId) return;
    try {
      await apiDeleteUserProject(authUserId, id, authToken);
      await loadProjects();
    } catch {}
  };

  const handleProjectImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setProjectImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAddProjectTag = () => {
    if (newProjectTag.trim() && !newProject.tags?.includes(newProjectTag.trim())) {
      setNewProject({ ...newProject, tags: [...(newProject.tags || []), newProjectTag.trim()] });
      setNewProjectTag('');
    }
  };

  const handleRemoveProjectTag = (tag: string) => {
    setNewProject({ ...newProject, tags: newProject.tags?.filter(t => t !== tag) });
  };

  // Certification handlers
  const handleAddCertification = async () => {
    if (!newCertification.name?.trim()) return;

    if (authUserId) {
      try {
        await apiCreateUserCertification(authUserId, {
          name: newCertification.name.trim(),
          description: newCertification.description?.trim(),
          imageUrl: certImagePreview || newCertification.imageUrl,
        }, authToken);
        await loadCertifications();
      } catch {}
    }
    closeModal();
  };

  const handleEditCertification = (cert: Certification) => {
    setEditingItem(cert.id);
    setNewCertification(cert);
    setCertImagePreview(cert.imageUrl || null);
    setActiveModal('certification');
  };

  const handleDeleteCertification = async (id: string) => {
    if (!authUserId) return;
    try {
      await apiDeleteUserCertification(authUserId, id, authToken);
      await loadCertifications();
    } catch {}
  };

  const handleCertImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setCertImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // Society handlers
  const handleAddSociety = () => {
    if (!newSociety.societyName?.trim() || !newSociety.role?.trim()) return;

    const soc: Society = {
      id: editingItem || `soc-${Date.now()}`,
      societyName: newSociety.societyName.trim(),
      role: newSociety.role.trim(),
      startDate: newSociety.startDate || new Date(),
      endDate: newSociety.endDate,
    };

    if (editingItem) {
      setSocieties(societies.map(s => s.id === editingItem ? soc : s));
    } else {
      setSocieties([...societies, soc]);
    }
    closeModal();
  };

  const handleEditSociety = (soc: Society) => {
    setEditingItem(soc.id);
    setNewSociety(soc);
    setActiveModal('society');
  };

  const handleDeleteSociety = (id: string) => {
    setSocieties(societies.filter(s => s.id !== id));
  };

  // Achievement handlers
  const handleAddAchievement = () => {
    if (!newAchievement.title?.trim()) return;

    const ach: Achievement = {
      id: editingItem || `ach-${Date.now()}`,
      title: newAchievement.title.trim(),
      year: newAchievement.year || new Date().getFullYear(),
      description: newAchievement.description?.trim(),
    };

    if (editingItem) {
      setAchievements(achievements.map(a => a.id === editingItem ? ach : a));
    } else {
      setAchievements([...achievements, ach]);
    }
    closeModal();
  };

  const handleEditAchievement = (ach: Achievement) => {
    setEditingItem(ach.id);
    setNewAchievement(ach);
    setActiveModal('achievement');
  };

  const handleDeleteAchievement = (id: string) => {
    setAchievements(achievements.filter(a => a.id !== id));
  };

  // Section Header Component
  const SectionHeader = ({ title, icon: Icon, onAdd }: { title: string; icon: React.ElementType; onAdd?: () => void }) => (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
          <Icon className="w-5 h-5 text-white" />
        </div>
        <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
      </div>
      {isOwnProfile && onAdd && (
        <Button variant="ghost" size="sm" onClick={onAdd} className="text-blue-600 hover:text-blue-700 hover:bg-blue-50">
          <Plus className="w-4 h-4 mr-1" />
          Add
        </Button>
      )}
    </div>
  );

  // Empty State Component
  const EmptyState = ({ message, onAdd }: { message: string; onAdd?: () => void }) => (
    <div className="text-center py-8">
      <p className="text-gray-400 text-sm mb-3">{message}</p>
    </div>
  );

  // Item Actions Component
  const ItemActions = ({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) => (
    isOwnProfile ? (
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={onEdit} className="p-1.5 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition-colors">
          <Pencil className="w-4 h-4" />
        </button>
        <button onClick={onDelete} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    ) : null
  );

  return (
    <div className="min-h-screen bg-gray-50 pb-20 md:pb-0">
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        
        {/* ===== PROFILE HEADER ===== */}
        <Card className="overflow-hidden shadow-sm border-0">
          {/* Blue Gradient Cover */}
          <div className="h-32 bg-gradient-to-r from-blue-600 via-blue-500 to-blue-400" />
          
          <CardContent className="relative px-6 pb-6">
            <div className="flex flex-col md:flex-row md:items-end gap-4 -mt-16">
              {/* Profile Photo with Upload */}
              <div className="relative">
                <ProfilePhotoUpload
                  currentPhoto={displayedProfilePhoto}
                  hasCustomPhoto={hasCustomProfilePhoto}
                  name={student.name}
                  editable={isOwnProfile}
                  onPhotoChange={handleProfilePhotoChange}
                />
              </div>

              {/* Profile Info */}
              <div className="flex-1 md:pb-2">
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                  <div>
                    <h1 className="text-2xl font-bold text-gray-900">{student.name}</h1>
                    {student.headline ? (
                      <p className="text-gray-600 font-medium mt-1">{student.headline}</p>
                    ) : isOwnProfile ? (
                      <p className="text-gray-400 text-sm italic mt-1">Add a professional headline</p>
                    ) : null}
                    
                    <div className="flex flex-wrap items-center gap-4 mt-3 text-sm text-gray-500">
                      <span className="flex items-center gap-1">
                        <GraduationCap className="w-4 h-4" />
                        {student.branch}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="w-4 h-4" />
                        Year {student.year}
                      </span>
                      <span className="flex items-center gap-1">
                        <Mail className="w-4 h-4" />
                        {student.email}
                      </span>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-2">
                    {isOwnProfile ? (
                      <Button
                        onClick={() => setActiveModal('editProfile')}
                        className="bg-blue-600 hover:bg-blue-700 text-white"
                      >
                        <Edit2 className="w-4 h-4 mr-2" />
                        Edit Profile
                      </Button>
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
              </div>
            </div>

            {/* Stats Bar */}
            <div className="flex items-center gap-8 mt-6 pt-6 border-t border-gray-100">
              <div className="text-center">
                <p className="text-2xl font-bold text-gray-900">{followersCount}</p>
                <p className="text-xs text-gray-500">Followers</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-gray-900">{followingCount}</p>
                <p className="text-xs text-gray-500">Following</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-gray-900">{loadedProjects.length}</p>
                <p className="text-xs text-gray-500">Projects</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-gray-900">{loadedCertifications.length}</p>
                <p className="text-xs text-gray-500">Certifications</p>
              </div>
              {student.resumeUrl && (
                <Button variant="outline" size="sm" className="ml-auto">
                  <Download className="w-4 h-4 mr-2" />
                  Resume
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* ===== ABOUT SECTION ===== */}
        <Card className="shadow-sm border-0">
          <CardContent className="p-6">
            <SectionHeader 
              title="About" 
              icon={Users} 
              onAdd={!student.bio ? () => setActiveModal('about') : undefined} 
            />
            {student.bio ? (
              <div className="group relative">
                <p className="text-gray-700 leading-relaxed">{student.bio}</p>
                {isOwnProfile && (
                  <button
                    onClick={() => setActiveModal('about')}
                    className="absolute top-0 right-0 p-1.5 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-600 opacity-0 group-hover:opacity-100 transition-all"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                )}
              </div>
            ) : (
              <EmptyState message="Add a short bio to introduce yourself" onAdd={() => setActiveModal('about')} />
            )}
          </CardContent>
        </Card>

        {/* ===== SKILLS SECTION ===== */}
        <Card className="shadow-sm border-0">
          <CardContent className="p-6">
            <SectionHeader title="Skills" icon={Award} onAdd={() => setActiveModal('skill')} />
            {skillsLoading ? (
              <p className="text-gray-400 text-sm">Loading skills...</p>
            ) : (isOwnProfile ? skills : student.skills || []).length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {(isOwnProfile ? skills : student.skills.map((s, i) => ({ id: String(i), name: s }))).map((skill) => (
                  <Badge
                    key={skill.id}
                    className="bg-blue-50 text-blue-700 border border-blue-200 px-3 py-1.5 text-sm group/skill"
                  >
                    {typeof skill === 'string' ? skill : skill.name}
                    {isOwnProfile && (
                      <button
                        onClick={() => handleRemoveSkill(skill.id)}
                        className="ml-2 opacity-0 group-hover/skill:opacity-100 hover:text-red-600 transition-opacity"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </Badge>
                ))}
              </div>
            ) : (
              <EmptyState message="Add skills to showcase your expertise" onAdd={() => setActiveModal('skill')} />
            )}
          </CardContent>
        </Card>

        {/* ===== EXPERIENCE SECTION ===== */}
        <Card className="shadow-sm border-0">
          <CardContent className="p-6">
            <SectionHeader title="Experience" icon={Briefcase} onAdd={() => setActiveModal('experience')} />
            {experiences.length > 0 ? (
              <div className="space-y-4">
                {experiences.map((exp) => (
                  <div key={exp.id} className="flex gap-4 p-4 rounded-xl hover:bg-gray-50 transition-colors group">
                    <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0">
                      <Briefcase className="w-6 h-6 text-blue-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between">
                        <div>
                          <h4 className="font-semibold text-gray-900">{exp.roleTitle}</h4>
                          <p className="text-gray-600">{exp.organization}</p>
                          <p className="text-sm text-gray-400 mt-1">
                            {format(exp.startDate, 'MMM yyyy')} - {exp.isCurrentlyWorking ? 'Present' : exp.endDate ? format(exp.endDate, 'MMM yyyy') : 'Present'}
                          </p>
                        </div>
                        <ItemActions onEdit={() => handleEditExperience(exp)} onDelete={() => handleDeleteExperience(exp.id)} />
                      </div>
                      {exp.description && <p className="text-gray-600 text-sm mt-2">{exp.description}</p>}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState message="Add your work experience" onAdd={() => setActiveModal('experience')} />
            )}
          </CardContent>
        </Card>

        {/* ===== PROJECTS SECTION ===== */}
        <Card className="shadow-sm border-0">
          <CardContent className="p-6">
            <SectionHeader title="Projects" icon={ExternalLink} onAdd={() => setActiveModal('project')} />
            {projectsLoading ? (
              <p className="text-gray-400 text-sm">Loading projects...</p>
            ) : loadedProjects.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {loadedProjects.map((project) => (
                  <div key={project.id} className="border rounded-xl overflow-hidden hover:shadow-md transition-shadow group">
                    {project.imageUrl ? (
                      <ImageWithFallback src={project.imageUrl} alt={project.title} className="w-full h-40 object-cover" />
                    ) : (
                      <div className="w-full h-40 bg-gradient-to-br from-blue-100 to-blue-50 flex items-center justify-center">
                        <ExternalLink className="w-12 h-12 text-blue-300" />
                      </div>
                    )}
                    <div className="p-4">
                      <div className="flex items-start justify-between">
                        <h4 className="font-semibold text-gray-900">{project.title}</h4>
                        <ItemActions onEdit={() => handleEditProject(project)} onDelete={() => handleDeleteProject(project.id)} />
                      </div>
                      <p className="text-gray-600 text-sm mt-1 line-clamp-2">{project.description}</p>
                      
                      {project.tags && project.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-3">
                          {project.tags.slice(0, 4).map((tag) => (
                            <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>
                          ))}
                        </div>
                      )}
                      
                      <div className="flex gap-2 mt-3">
                        {project.githubUrl && (
                          <a href={project.githubUrl} target="_blank" rel="noopener noreferrer" className="p-2 rounded-lg hover:bg-gray-100 text-gray-600">
                            <Github className="w-4 h-4" />
                          </a>
                        )}
                        {project.liveUrl && (
                          <a href={project.liveUrl} target="_blank" rel="noopener noreferrer" className="p-2 rounded-lg hover:bg-gray-100 text-gray-600">
                            <Globe className="w-4 h-4" />
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState message="Showcase your projects" onAdd={() => setActiveModal('project')} />
            )}
          </CardContent>
        </Card>

        {/* ===== CERTIFICATIONS SECTION ===== */}
        <Card className="shadow-sm border-0">
          <CardContent className="p-6">
            <SectionHeader title="Certifications" icon={Trophy} onAdd={() => setActiveModal('certification')} />
            {certificationsLoading ? (
              <p className="text-gray-400 text-sm">Loading certifications...</p>
            ) : loadedCertifications.length > 0 ? (
              <div className="space-y-3">
                {loadedCertifications.map((cert) => (
                  <div key={cert.id} className="flex items-center gap-4 p-4 rounded-xl hover:bg-gray-50 transition-colors group">
                    {cert.imageUrl ? (
                      <img src={cert.imageUrl} alt={cert.name} className="w-12 h-12 rounded-lg object-cover" />
                    ) : (
                      <div className="w-12 h-12 rounded-xl bg-yellow-100 flex items-center justify-center flex-shrink-0">
                        <Trophy className="w-6 h-6 text-yellow-600" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between">
                        <div>
                          <h4 className="font-medium text-gray-900">{cert.name}</h4>
                          {cert.issuer && <p className="text-sm text-gray-500">{cert.issuer}</p>}
                          {cert.issueDate && (
                            <p className="text-xs text-gray-400 mt-1">Issued {format(new Date(cert.issueDate), 'MMM yyyy')}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {cert.certificateUrl && (
                            <a href={cert.certificateUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline">
                              View
                            </a>
                          )}
                          <ItemActions onEdit={() => handleEditCertification(cert)} onDelete={() => handleDeleteCertification(cert.id)} />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState message="Add your certifications" onAdd={() => setActiveModal('certification')} />
            )}
          </CardContent>
        </Card>

        {/* ===== SOCIETIES & CLUBS SECTION ===== */}
        <Card className="shadow-sm border-0">
          <CardContent className="p-6">
            <SectionHeader title="Societies & Clubs" icon={Users} onAdd={() => setActiveModal('society')} />
            {societies.length > 0 ? (
              <div className="space-y-3">
                {societies.map((soc) => (
                  <div key={soc.id} className="flex gap-4 p-4 rounded-xl hover:bg-gray-50 transition-colors group">
                    <div className="w-12 h-12 rounded-xl bg-green-100 flex items-center justify-center flex-shrink-0">
                      <Users className="w-6 h-6 text-green-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between">
                        <div>
                          <h4 className="font-semibold text-gray-900">{soc.societyName}</h4>
                          <p className="text-gray-600">{soc.role}</p>
                          <p className="text-sm text-gray-400 mt-1">
                            {format(soc.startDate, 'MMM yyyy')} - {soc.endDate ? format(soc.endDate, 'MMM yyyy') : 'Present'}
                          </p>
                        </div>
                        <ItemActions onEdit={() => handleEditSociety(soc)} onDelete={() => handleDeleteSociety(soc.id)} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState message="Add societies and clubs you're part of" onAdd={() => setActiveModal('society')} />
            )}
          </CardContent>
        </Card>

        {/* ===== ACHIEVEMENTS SECTION ===== */}
        <Card className="shadow-sm border-0">
          <CardContent className="p-6">
            <SectionHeader title="Achievements" icon={Award} onAdd={() => setActiveModal('achievement')} />
            {achievements.length > 0 ? (
              <div className="space-y-3">
                {achievements.map((ach) => (
                  <div key={ach.id} className="flex gap-4 p-4 rounded-xl hover:bg-gray-50 transition-colors group">
                    <div className="w-12 h-12 rounded-xl bg-orange-100 flex items-center justify-center flex-shrink-0">
                      <Trophy className="w-6 h-6 text-orange-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between">
                        <div>
                          <h4 className="font-semibold text-gray-900">{ach.title}</h4>
                          <p className="text-sm text-gray-400">{ach.year}</p>
                          {ach.description && <p className="text-gray-600 text-sm mt-1">{ach.description}</p>}
                        </div>
                        <ItemActions onEdit={() => handleEditAchievement(ach)} onDelete={() => handleDeleteAchievement(ach.id)} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState message="Add your achievements and awards" onAdd={() => setActiveModal('achievement')} />
            )}
          </CardContent>
        </Card>
      </div>

      {/* ===== MODALS ===== */}

      {/* Edit Profile Modal */}
      <Modal isOpen={activeModal === 'editProfile'} onClose={closeModal} title="Edit Profile">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <Input
              value={editedStudent.name}
              onChange={(e) => setEditedStudent({ ...editedStudent, name: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Professional Headline</label>
            <Input
              value={editedStudent.headline || ''}
              onChange={(e) => setEditedStudent({ ...editedStudent, headline: e.target.value })}
              placeholder="e.g., Aspiring ML Engineer | Python Developer"
            />
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={closeModal}>Cancel</Button>
            <Button onClick={handleSaveProfile} className="bg-blue-600 hover:bg-blue-700">Save Changes</Button>
          </div>
        </div>
      </Modal>

      {/* About Modal */}
      <Modal isOpen={activeModal === 'about'} onClose={closeModal} title="Edit About">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Bio</label>
            <Textarea
              value={editedStudent.bio || ''}
              onChange={(e) => setEditedStudent({ ...editedStudent, bio: e.target.value })}
              rows={5}
              maxLength={500}
              placeholder="Write a short introduction about yourself..."
            />
            <p className="text-xs text-gray-400 mt-1">{(editedStudent.bio || '').length}/500</p>
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={closeModal}>Cancel</Button>
            <Button onClick={handleSaveProfile} className="bg-blue-600 hover:bg-blue-700">Save</Button>
          </div>
        </div>
      </Modal>

      {/* Skill Modal */}
      <Modal isOpen={activeModal === 'skill'} onClose={closeModal} title="Add Skill">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Skill Name</label>
            <Input
              value={newSkillName}
              onChange={(e) => setNewSkillName(e.target.value)}
              placeholder="e.g., Python, React, Machine Learning"
              onKeyPress={(e) => e.key === 'Enter' && handleAddSkill()}
            />
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={closeModal}>Cancel</Button>
            <Button onClick={handleAddSkill} disabled={!newSkillName.trim()} className="bg-blue-600 hover:bg-blue-700">
              Add Skill
            </Button>
          </div>
        </div>
      </Modal>

      {/* Experience Modal */}
      <Modal isOpen={activeModal === 'experience'} onClose={closeModal} title={editingItem ? 'Edit Experience' : 'Add Experience'}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Role Title *</label>
            <Input
              value={newExperience.roleTitle || ''}
              onChange={(e) => setNewExperience({ ...newExperience, roleTitle: e.target.value })}
              placeholder="e.g., Software Engineer Intern"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Organization *</label>
            <Input
              value={newExperience.organization || ''}
              onChange={(e) => setNewExperience({ ...newExperience, organization: e.target.value })}
              placeholder="e.g., Google"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start Date *</label>
              <DatePicker
                date={newExperience.startDate}
                onSelect={(date) => setNewExperience({ ...newExperience, startDate: date })}
                placeholder="Select start date"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
              <DatePicker
                date={newExperience.endDate}
                onSelect={(date) => setNewExperience({ ...newExperience, endDate: date })}
                placeholder="Select end date"
                disabled={newExperience.isCurrentlyWorking}
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="currentlyWorking"
              checked={newExperience.isCurrentlyWorking}
              onCheckedChange={(checked) => setNewExperience({ ...newExperience, isCurrentlyWorking: checked as boolean })}
            />
            <label htmlFor="currentlyWorking" className="text-sm text-gray-700">I currently work here</label>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <Textarea
              value={newExperience.description || ''}
              onChange={(e) => setNewExperience({ ...newExperience, description: e.target.value })}
              placeholder="Describe your role and achievements"
              rows={3}
            />
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={closeModal}>Cancel</Button>
            <Button
              onClick={handleAddExperience}
              disabled={!newExperience.roleTitle?.trim() || !newExperience.organization?.trim()}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {editingItem ? 'Update' : 'Add'} Experience
            </Button>
          </div>
        </div>
      </Modal>

      {/* Project Modal */}
      <Modal isOpen={activeModal === 'project'} onClose={closeModal} title={editingItem ? 'Edit Project' : 'Add Project'}>
        <div className="space-y-4 max-h-[70vh] overflow-y-auto">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Project Image</label>
            <div className="border-2 border-dashed border-gray-200 rounded-xl p-4 text-center hover:border-blue-400 transition-colors cursor-pointer"
              onClick={() => document.getElementById('projectImageInput')?.click()}>
              <input
                id="projectImageInput"
                type="file"
                accept="image/*"
                onChange={handleProjectImageChange}
                className="hidden"
              />
              {projectImagePreview ? (
                <img src={projectImagePreview} alt="Preview" className="w-full h-32 object-cover rounded-lg" />
              ) : (
                <div className="py-4">
                  <Upload className="w-8 h-8 mx-auto text-gray-400" />
                  <p className="text-sm text-gray-500 mt-2">Click to upload image</p>
                </div>
              )}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Project Title *</label>
            <Input
              value={newProject.title || ''}
              onChange={(e) => setNewProject({ ...newProject, title: e.target.value })}
              placeholder="e.g., Campus Connect App"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description *</label>
            <Textarea
              value={newProject.description || ''}
              onChange={(e) => setNewProject({ ...newProject, description: e.target.value })}
              placeholder="Describe your project"
              rows={3}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tech Stack</label>
            <div className="flex gap-2">
              <Input
                value={newProjectTag}
                onChange={(e) => setNewProjectTag(e.target.value)}
                placeholder="Add technology"
                onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddProjectTag())}
              />
              <Button type="button" variant="outline" onClick={handleAddProjectTag}>Add</Button>
            </div>
            {newProject.tags && newProject.tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {newProject.tags.map((tag) => (
                  <Badge key={tag} className="bg-blue-50 text-blue-700">
                    {tag}
                    <button onClick={() => handleRemoveProjectTag(tag)} className="ml-1 hover:text-red-600">
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">GitHub URL</label>
            <Input
              value={newProject.githubUrl || ''}
              onChange={(e) => setNewProject({ ...newProject, githubUrl: e.target.value })}
              placeholder="https://github.com/..."
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Live Demo URL</label>
            <Input
              value={newProject.liveUrl || ''}
              onChange={(e) => setNewProject({ ...newProject, liveUrl: e.target.value })}
              placeholder="https://..."
            />
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={closeModal}>Cancel</Button>
            <Button
              onClick={handleAddProject}
              disabled={!newProject.title?.trim() || !newProject.description?.trim()}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {editingItem ? 'Update' : 'Add'} Project
            </Button>
          </div>
        </div>
      </Modal>

      {/* Certification Modal */}
      <Modal isOpen={activeModal === 'certification'} onClose={closeModal} title={editingItem ? 'Edit Certification' : 'Add Certification'}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Certificate Image (Optional)</label>
            <div className="border-2 border-dashed border-gray-200 rounded-xl p-4 text-center hover:border-blue-400 transition-colors cursor-pointer"
              onClick={() => document.getElementById('certImageInput')?.click()}>
              <input
                id="certImageInput"
                type="file"
                accept="image/*"
                onChange={handleCertImageChange}
                className="hidden"
              />
              {certImagePreview ? (
                <img src={certImagePreview} alt="Preview" className="w-full h-24 object-cover rounded-lg" />
              ) : (
                <div className="py-2">
                  <Upload className="w-6 h-6 mx-auto text-gray-400" />
                  <p className="text-xs text-gray-500 mt-1">Upload certificate image</p>
                </div>
              )}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Certification Name *</label>
            <Input
              value={newCertification.name || ''}
              onChange={(e) => setNewCertification({ ...newCertification, name: e.target.value })}
              placeholder="e.g., AWS Cloud Practitioner"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Issuing Organization</label>
            <Input
              value={newCertification.issuer || ''}
              onChange={(e) => setNewCertification({ ...newCertification, issuer: e.target.value })}
              placeholder="e.g., Amazon Web Services"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Issue Date</label>
            <DatePicker
              date={newCertification.issueDate}
              onSelect={(date) => setNewCertification({ ...newCertification, issueDate: date })}
              placeholder="Select issue date"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Certificate URL</label>
            <Input
              value={newCertification.certificateUrl || ''}
              onChange={(e) => setNewCertification({ ...newCertification, certificateUrl: e.target.value })}
              placeholder="Link to verify certificate"
            />
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={closeModal}>Cancel</Button>
            <Button
              onClick={handleAddCertification}
              disabled={!newCertification.name?.trim()}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {editingItem ? 'Update' : 'Add'} Certification
            </Button>
          </div>
        </div>
      </Modal>

      {/* Society Modal */}
      <Modal isOpen={activeModal === 'society'} onClose={closeModal} title={editingItem ? 'Edit Society/Club' : 'Add Society/Club'}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Society/Club Name *</label>
            <Input
              value={newSociety.societyName || ''}
              onChange={(e) => setNewSociety({ ...newSociety, societyName: e.target.value })}
              placeholder="e.g., Google Developer Student Club"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Your Role *</label>
            <Input
              value={newSociety.role || ''}
              onChange={(e) => setNewSociety({ ...newSociety, role: e.target.value })}
              placeholder="e.g., Technical Lead, Member, Volunteer"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start Date *</label>
              <DatePicker
                date={newSociety.startDate}
                onSelect={(date) => setNewSociety({ ...newSociety, startDate: date })}
                placeholder="Select start date"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
              <DatePicker
                date={newSociety.endDate}
                onSelect={(date) => setNewSociety({ ...newSociety, endDate: date })}
                placeholder="Select end date"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={closeModal}>Cancel</Button>
            <Button
              onClick={handleAddSociety}
              disabled={!newSociety.societyName?.trim() || !newSociety.role?.trim()}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {editingItem ? 'Update' : 'Add'} Society
            </Button>
          </div>
        </div>
      </Modal>

      {/* Achievement Modal */}
      <Modal isOpen={activeModal === 'achievement'} onClose={closeModal} title={editingItem ? 'Edit Achievement' : 'Add Achievement'}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Achievement Title *</label>
            <Input
              value={newAchievement.title || ''}
              onChange={(e) => setNewAchievement({ ...newAchievement, title: e.target.value })}
              placeholder="e.g., First Place - Hackathon XYZ"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Year *</label>
            <Input
              type="number"
              value={newAchievement.year || ''}
              onChange={(e) => setNewAchievement({ ...newAchievement, year: parseInt(e.target.value) })}
              placeholder="e.g., 2024"
              min="1990"
              max={new Date().getFullYear()}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description (Optional)</label>
            <Textarea
              value={newAchievement.description || ''}
              onChange={(e) => setNewAchievement({ ...newAchievement, description: e.target.value })}
              placeholder="Brief description of the achievement"
              rows={2}
            />
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={closeModal}>Cancel</Button>
            <Button
              onClick={handleAddAchievement}
              disabled={!newAchievement.title?.trim() || !newAchievement.year}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {editingItem ? 'Update' : 'Add'} Achievement
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
