import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import {
  GraduationCap,
  Calendar,
  MapPin,
  Edit2,
  ExternalLink,
  Plus,
  X,
  Heart,
  MessageCircle,
  Bookmark,
  Award,
  Users,
  Trophy,
  Pencil,
  Trash2,
  Upload,
  Eye,
} from 'lucide-react';
import { Student, Opportunity } from '../types';
import type { FollowGraph } from '../App';
import { FollowButton } from './network/FollowButton';
import { useAuth } from '../context/AuthContext';
import { apiAddUserSkill, apiDeleteUserSkill, apiFetchUserSkills, type UserSkill } from '../lib/skillsApi';
import {
  apiCreateUserCertification,
  apiFetchUserCertifications,
  apiDeleteUserCertification,
} from '../lib/certificationsApi';
import {
  apiCreateUserProject,
  apiDeleteUserProject,
  apiFetchUserProjects,
} from '../lib/projectsApi';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Checkbox } from './ui/checkbox';
import { Modal } from './ui/modal';
import { DatePicker } from './ui/date-picker';
import { ImageWithFallback } from './figma/ImageWithFallback';
import { ProfilePhotoUpload } from './ui/profile-photo-upload';
import { apiUpdateUserProfilePicture, apiUploadUserProfilePicture } from '../lib/authApi';
import { OpportunityCard } from './OpportunityCard';
import { apiFetchProfilePosts, type UserPost } from '../lib/postsApi';
import { LoadingIndicator } from './ui/LoadingIndicator';

interface ProfilePageProps {
  student: Student;
  currentUserId: string;
  isOwnProfile: boolean;
  followGraph: FollowGraph;
  onFollow: (targetUserId: string, accountType?: 'public' | 'private') => void;
  onUnfollow: (targetUserId: string) => void;
  onCancelRequest: (targetUserId: string) => void;
  onEdit?: (updates: Partial<Student>) => void;
  opportunities?: Opportunity[];
  onLike?: (opportunityId: string) => void;
  onSave?: (opportunityId: string) => void;
  onComment?: (opportunityId: string, comment: string) => void;
  onReply?: (commentId: string, comment: string) => void;
  onLikeComment?: (commentId: string, alreadyLiked: boolean) => void;
  onDeleteComment?: (commentId: string) => void;
  onEditPost?: (postId: string, updates: Partial<Opportunity>) => void;
  onDeletePost?: (postId: string) => void;
  onOpenPost?: (post: Opportunity) => void;
  onShowAllPosts?: (userId: string) => void;
  onShowAllProjects?: (userId: string) => void;
  onMessage?: (userId: string) => void;
  postsRefreshToken?: number;
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
  onLike,
  onSave,
  onComment,
  onReply,
  onLikeComment,
  onDeleteComment,
  onEditPost,
  onDeletePost,
  onOpenPost,
  onShowAllPosts,
  onShowAllProjects,
  onMessage,
  postsRefreshToken = 0,
  currentUserId,
  followGraph,
  onFollow,
  onUnfollow,
  onCancelRequest,
}: ProfilePageProps) {
  const auth = useAuth();

  // Profile state
  const [editedStudent, setEditedStudent] = useState(student);
  const [isAboutExpanded, setIsAboutExpanded] = useState(false);

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
  const [loadedPosts, setLoadedPosts] = useState<Opportunity[]>([]);
  const [postsLoading, setPostsLoading] = useState(false);

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

  const mapApiPostToOpportunity = (post: UserPost): Opportunity => {
    let mappedType: Opportunity['type'] = 'general';
    if (post.postType === 'event') {
      mappedType = 'event';
    } else if (post.postType === 'opportunity') {
      mappedType = (post.opportunityType ?? 'event') as Opportunity['type'];
    }

    return {
      id: post.id,
      authorId: student.id,
      authorName: student.name,
      authorAvatar: student.avatar,
      type: mappedType,
      title: post.title ?? '',
      description: post.contentText ?? '',
      date: post.createdAt,
      company: post.company ?? undefined,
      deadline: post.deadline ?? undefined,
      stipend: post.stipend ?? undefined,
      duration: post.duration ?? undefined,
      location: post.location ?? undefined,
      link: post.externalUrl ?? undefined,
      image: post.media[0]?.mediaUrl,
      tags: post.hashtags,
      likes: [],
      comments: (post.comments ?? []).map((comment) => ({
        id: comment.id,
        postId: comment.postId,
        authorId: comment.authorUserId,
        authorName: comment.authorUsername,
        authorAvatar:
          comment.authorProfilePictureUrl ??
          '',
        content: comment.content,
        timestamp: comment.createdAt,
        parentCommentId: comment.parentCommentId,
        likeCount: comment.likeCount,
        isLikedByMe: comment.isLikedByMe,
        canDelete: comment.canDelete,
        replies: comment.replies.map((reply) => ({
          id: reply.id,
          postId: reply.postId,
          authorId: reply.authorUserId,
          authorName: reply.authorUsername,
          authorAvatar:
            reply.authorProfilePictureUrl ??
            '',
          content: reply.content,
          timestamp: reply.createdAt,
          parentCommentId: reply.parentCommentId,
          likeCount: reply.likeCount,
          isLikedByMe: reply.isLikedByMe,
          canDelete: reply.canDelete,
          replies: [],
        })),
      })),
      saved: [],
      likeCount: post.likeCount,
      saveCount: post.saveCount,
      commentCount: post.commentCount,
      isLikedByMe: post.isLikedByMe,
      isSavedByMe: post.isSavedByMe,
      canEdit: post.canEdit,
      canDelete: post.canDelete,
    };
  };

  const loadPosts = async () => {
    if (!student.id) return;
    setPostsLoading(true);
    try {
      const list = await apiFetchProfilePosts(student.id, authToken);
      setLoadedPosts(list.map(mapApiPostToOpportunity));
    } catch {
      setLoadedPosts([]);
    } finally {
      setPostsLoading(false);
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
    loadPosts();
  }, [student.id, authToken, isOwnProfile, authUserId, postsRefreshToken]);

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
  const profilePosts = [...loadedPosts].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

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

  const currentProfilePhoto = isOwnProfile ? auth.profile?.profilePictureUrl ?? null : null;
  const hasCustomProfilePhoto = isOwnProfile && Boolean(auth.profile?.profilePictureUrl);
  const displayedProfilePhoto = isOwnProfile ? currentProfilePhoto ?? student.avatar : student.avatar;

  const handleProfilePhotoChange = async (payload: { file?: File; previewUrl?: string; remove?: boolean }) => {
    if (!isOwnProfile || !authUserId) return;

    if (payload.remove) {
      await apiUpdateUserProfilePicture(authUserId, null, authToken);
      onEdit?.({ avatar: undefined });
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

  const displaySkills = isOwnProfile ? skills : student.skills.map((name, index) => ({ id: String(index), name }));
  const featuredProject = loadedProjects[0];
  const featuredPost = profilePosts[0];
  const featuredAchievement = achievements[0];
  const hasAbout = Boolean(student.bio?.trim());
  const clubCount = societies.length;
  const hasFeaturedContent = Boolean(featuredProject || featuredPost || featuredAchievement);
  const showFeaturedSection = isOwnProfile || hasFeaturedContent;
  const showPostsSection = isOwnProfile || postsLoading || profilePosts.length > 0;
  const showProjectsSection = isOwnProfile || projectsLoading || loadedProjects.length > 0;
  const showExperienceSection = isOwnProfile || experiences.length > 0;
  const showEducationSection = isOwnProfile || Boolean(student.branch || student.year);
  const showSkillsSection = isOwnProfile || skillsLoading || displaySkills.length > 0;
  const showCertificationsSection = isOwnProfile || certificationsLoading || loadedCertifications.length > 0;
  const showClubsSection = isOwnProfile || societies.length > 0;
  const showAchievementsSection = isOwnProfile || achievements.length > 0;

  const SectionHeader = ({
    title,
    subtitle,
    onAdd,
  }: {
    title: string;
    subtitle?: string;
    onAdd?: () => void;
  }) => (
    <div className="mb-4 flex items-end justify-between gap-4">
      <div>
        <h2 className="text-xl font-semibold tracking-tight text-slate-950">{title}</h2>
        {subtitle ? <p className="mt-1 text-sm text-slate-500">{subtitle}</p> : null}
      </div>
      {isOwnProfile && onAdd ? (
        <Button variant="outline" size="sm" onClick={onAdd} className="shrink-0 rounded-full border-slate-200 bg-white shadow-sm hover:bg-slate-50">
          <Plus className="mr-1.5 h-4 w-4" />
          Add
        </Button>
      ) : null}
    </div>
  );

  const EmptyState = ({ message }: { message: string }) => (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white/70 px-6 py-8 text-center shadow-sm">
      <p className="text-sm font-medium text-slate-600">{message}</p>
    </div>
  );

  // Item Actions Component
  const ItemActions = ({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) => (
    isOwnProfile ? (
      <div className="flex items-center gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
        <button type="button" onClick={onEdit} className="rounded-full p-1.5 text-slate-400 transition-colors hover:bg-blue-50 hover:text-blue-600" aria-label="Edit item">
          <Pencil className="w-4 h-4" />
        </button>
        <button type="button" onClick={onDelete} className="rounded-full p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600" aria-label="Delete item">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    ) : null
  );

  const handleHorizontalWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    const container = event.currentTarget;
    const nextDelta = Math.abs(event.deltaY) > Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
    const canScroll = container.scrollWidth > container.clientWidth;
    if (!canScroll || nextDelta === 0) return;

    container.scrollLeft += nextDelta;
    event.preventDefault();
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-24 md:pb-8">
      <div className="mx-auto max-w-5xl space-y-8 px-4 py-6 sm:px-6 lg:px-8">
        <section className="overflow-hidden rounded-[1.75rem] border border-slate-200/80 bg-white shadow-xl shadow-slate-200/70">
          <div className="relative h-48 bg-gradient-to-br from-sky-600 via-indigo-500 to-emerald-400 sm:h-60">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_20%,rgba(255,255,255,0.35),transparent_28%),linear-gradient(to_top,rgba(15,23,42,0.72),rgba(15,23,42,0.12))]" />
            <div className="absolute bottom-6 left-6 hidden max-w-xl text-white sm:block">
              <p className="text-sm font-medium uppercase tracking-[0.18em] text-white/75">Campus profile</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight">{student.name}</h1>
            </div>
            {isOwnProfile ? (
              <button
                type="button"
                onClick={() => setActiveModal('editProfile')}
                className="absolute right-5 top-5 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/92 text-slate-700 shadow-lg transition hover:scale-[1.02] hover:bg-white"
                aria-label="Edit profile"
              >
                <Edit2 className="h-4 w-4" />
              </button>
            ) : null}
          </div>

          <div className="px-5 pb-6 sm:px-8">
            <div className="-mt-16 flex flex-col gap-5 sm:-mt-14 sm:flex-row sm:items-end sm:justify-between">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
                <ProfilePhotoUpload
                  currentPhoto={displayedProfilePhoto}
                  hasCustomPhoto={hasCustomProfilePhoto}
                  name={student.name}
                  editable={isOwnProfile}
                  onPhotoChange={handleProfilePhotoChange}
                />
                <div className="pt-2 sm:pb-1">
                  <h1 className="text-3xl font-semibold tracking-tight text-slate-950 sm:hidden">{student.name}</h1>
                  <p className="mt-2 max-w-2xl text-base font-normal text-slate-700 sm:text-lg">
                    {student.headline || (isOwnProfile ? 'Add a headline that tells campus what you are building.' : 'Campus community member')}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm font-normal text-slate-500">
                    <span className="inline-flex items-center gap-1.5">
                      <GraduationCap className="h-4 w-4" />
                      {student.branch || 'College'}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <Calendar className="h-4 w-4" />
                      Year {student.year || '-'}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <MapPin className="h-4 w-4" />
                      Campus
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {!isOwnProfile ? (
                  <>
                    <div className="rounded-full bg-white shadow-sm">
                      <FollowButton
                      targetName={student.name}
                      accountType={student.accountType}
                      isFollowing={isFollowing}
                      isFollower={isFollower}
                      requestStatus={requestStatus}
                      onFollow={() => onFollow(student.id, student.accountType)}
                      onUnfollow={() => onUnfollow(student.id)}
                      onCancelRequest={() => onCancelRequest(student.id)}
                      />
                    </div>
                    <Button variant="outline" onClick={() => onMessage?.(student.id)} className="rounded-full border-slate-200 bg-white shadow-sm hover:bg-slate-50">
                      <MessageCircle className="mr-2 h-4 w-4" />
                      Message
                    </Button>
                  </>
                ) : null}
              </div>
            </div>

            <div className="hide-scrollbar mt-4 flex flex-nowrap items-center gap-4 overflow-x-auto whitespace-nowrap border-t border-slate-100 pt-4 text-sm font-normal text-slate-500">
              {[
                ['Followers', followersCount],
                ['Following', followingCount],
                ['Projects', loadedProjects.length],
                ['Clubs', clubCount],
              ].map(([label, value]) => (
                <div key={label} className="inline-flex items-center gap-1.5">
                  <span className="text-sm font-medium text-slate-900">{value}</span>
                  <span>{label}</span>
                </div>
              ))}
            </div>

            {hasAbout || isOwnProfile ? (
              <div className="mt-5 border-t border-slate-100 pt-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h2 className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">About</h2>
                    {hasAbout ? (
                      <>
                        <p className={`mt-3 max-w-3xl text-sm leading-7 text-slate-700 ${isAboutExpanded ? '' : 'line-clamp-3'}`}>{student.bio}</p>
                        {student.bio && student.bio.length > 180 ? (
                          <button
                            type="button"
                            onClick={() => setIsAboutExpanded((value) => !value)}
                            className="mt-2 text-sm font-medium text-blue-600 hover:text-blue-700"
                          >
                            {isAboutExpanded ? 'See less' : 'See more'}
                          </button>
                        ) : null}
                      </>
                    ) : (
                      <p className="mt-3 text-sm leading-7 text-slate-500">Add a short intro that makes the profile feel like you.</p>
                    )}
                  </div>
                  {isOwnProfile ? (
                    <button
                      type="button"
                      onClick={() => setActiveModal('editProfile')}
                      className="rounded-full p-2 text-slate-400 transition hover:bg-blue-50 hover:text-blue-600"
                      aria-label="Edit profile details"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        </section>

        {showFeaturedSection ? (
        <section className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6">
          <SectionHeader title="Featured" subtitle="A quick glimpse of recent work and wins" />
          {hasFeaturedContent ? (
            <div className="space-y-4">
              <button
                type="button"
                onClick={() => featuredPost && onOpenPost?.(featuredPost)}
                className="group/highlight block min-h-52 w-full overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-blue-900 p-6 text-left text-white shadow-lg transition hover:-translate-y-0.5 hover:shadow-xl"
              >
                <p className="text-sm font-medium text-blue-100">{featuredProject ? 'Featured project' : featuredPost ? 'Featured post' : 'Achievement'}</p>
                <h3 className="mt-3 text-2xl font-semibold tracking-tight">
                  {featuredProject?.title || featuredPost?.title || featuredAchievement?.title}
                </h3>
                <p className="mt-3 line-clamp-3 max-w-3xl text-sm leading-6 text-white/75">
                  {featuredProject?.description || featuredPost?.description || featuredAchievement?.description || 'A highlighted milestone from this profile.'}
                </p>
                <span className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-white">
                  View highlight
                  <ExternalLink className="h-4 w-4 transition group-hover/highlight:translate-x-0.5" />
                </span>
              </button>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl bg-sky-50 px-4 py-3">
                  <p className="text-base font-medium text-sky-800">{profilePosts.length} posts shared</p>
                </div>
                <div className="rounded-2xl bg-emerald-50 px-4 py-3">
                  <p className="text-base font-medium text-emerald-800">{displaySkills.length} skills listed</p>
                </div>
                <div className="rounded-2xl bg-amber-50 px-4 py-3">
                  <p className="text-base font-medium text-amber-800">{achievements.length} achievements</p>
                </div>
              </div>
            </div>
          ) : (
            <EmptyState message="Nothing featured yet. Add projects, posts, or achievements to bring this area to life." />
          )}
        </section>
        ) : null}

        {showPostsSection ? (
        <section className="space-y-4">
          <SectionHeader title="Activity" subtitle="Recent posts and campus updates" />
          {postsLoading ? (
            <LoadingIndicator label="Loading posts..." className="justify-start" size={20} />
          ) : profilePosts.length > 0 ? (
            <>
              <div className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5">
                <div
                  className="hide-scrollbar w-full overflow-x-auto overscroll-x-contain pb-2"
                  onWheel={handleHorizontalWheel}
                >
                  <div className="flex w-max snap-x snap-mandatory gap-5">
                    {profilePosts.slice(0, 8).map((post) => (
                      <div key={post.id} className="w-[22rem] shrink-0 snap-start">
                        <OpportunityCard
                          opportunity={post}
                          currentUserId={currentUserId}
                          showManagementControls={isOwnProfile}
                          onLike={(id) => onLike?.(id)}
                          onSave={(id) => onSave?.(id)}
                          onComment={(id, comment) => onComment?.(id, comment)}
                          onReply={(commentId, comment) => onReply?.(commentId, comment)}
                          onLikeComment={(commentId, alreadyLiked) => onLikeComment?.(commentId, alreadyLiked)}
                          onDeleteComment={(commentId) => onDeleteComment?.(commentId)}
                          onEditPost={(postId, updates) => onEditPost?.(postId, updates)}
                          onDeletePost={(postId) => onDeletePost?.(postId)}
                          onOpenPost={onOpenPost}
                          onViewProfile={() => undefined}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <Button variant="outline" className="w-full rounded-2xl border-slate-200 bg-white shadow-sm hover:bg-slate-50" onClick={() => onShowAllPosts?.(student.id)}>
                Show all posts
              </Button>
            </>
          ) : (
            <EmptyState message="No posts yet. Share a campus update, project note, or opportunity." />
          )}
        </section>
        ) : null}

        {showProjectsSection ? (
        <section className="space-y-4">
          <SectionHeader title="Projects" subtitle="Selected builds, prototypes, and experiments" onAdd={() => setActiveModal('project')} />
          {projectsLoading ? (
            <LoadingIndicator label="Loading projects..." className="justify-start" size={20} />
          ) : loadedProjects.length > 0 ? (
            <>
              <div className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5">
                <div
                  className="hide-scrollbar w-full overflow-x-auto overscroll-x-contain pb-2"
                  onWheel={handleHorizontalWheel}
                >
                <div className="flex w-max snap-x snap-mandatory gap-4">
                {loadedProjects.map((project) => {
                  const projectLink = project.liveUrl || project.githubUrl || (project as Project & { link?: string | null }).link;
                  return (
                    <article key={project.id} className="group flex w-[20rem] shrink-0 snap-start flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg">
                      {project.imageUrl ? (
                        <ImageWithFallback src={project.imageUrl} alt={project.title} className="h-40 w-full object-cover" />
                      ) : (
                        <div className="flex h-40 items-center justify-center bg-gradient-to-br from-indigo-50 via-sky-50 to-emerald-50">
                          <ExternalLink className="h-10 w-10 text-indigo-300" />
                        </div>
                      )}
                      <div className="flex flex-1 flex-col p-4">
                        <div className="flex items-start justify-between gap-3">
                          <h3 className="font-semibold text-slate-950">{project.title}</h3>
                          <ItemActions onEdit={() => handleEditProject(project)} onDelete={() => handleDeleteProject(project.id)} />
                        </div>
                        <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-600">{project.description}</p>
                        {project.tags?.length ? (
                          <div className="mt-4 flex flex-wrap gap-1.5">
                            {project.tags.slice(0, 4).map((tag) => (
                              <Badge key={tag} className="rounded-full border border-slate-200 bg-slate-50 text-xs font-medium text-slate-600 shadow-none">{tag}</Badge>
                            ))}
                          </div>
                        ) : null}
                        {projectLink ? (
                          <a href={projectLink} target="_blank" rel="noopener noreferrer" className="mt-auto inline-flex items-center gap-1 pt-4 text-sm font-medium text-blue-600 hover:text-blue-700">
                            Visit project
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        ) : null}
                      </div>
                    </article>
                  );
                })}
                </div>
                </div>
              </div>
              <Button variant="outline" className="w-full rounded-2xl border-slate-200 bg-white shadow-sm hover:bg-slate-50" onClick={() => onShowAllProjects?.(student.id)}>
                Show all projects
              </Button>
            </>
          ) : (
            <EmptyState message="No projects yet. Start a showcase for the work you are proud of." />
          )}
        </section>
        ) : null}

        {showExperienceSection || showEducationSection ? (
        <section className="grid gap-8 lg:grid-cols-2">
          {showExperienceSection ? (
          <div className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6">
            <SectionHeader title="Experience" onAdd={() => setActiveModal('experience')} />
            {experiences.length > 0 ? (
              <div className="space-y-5">
                {experiences.map((exp) => (
                  <div key={exp.id} className="group relative border-l-2 border-blue-100 pl-5">
                    <span className="absolute -left-[9px] top-1 h-4 w-4 rounded-full border-4 border-white bg-blue-500 shadow" />
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-semibold text-slate-950">{exp.roleTitle}</h3>
                        <p className="text-sm text-slate-600">{exp.organization}</p>
                        <p className="mt-1 text-xs font-medium uppercase tracking-wide text-slate-400">
                          {format(exp.startDate, 'MMM yyyy')} - {exp.isCurrentlyWorking ? 'Present' : exp.endDate ? format(exp.endDate, 'MMM yyyy') : 'Present'}
                        </p>
                      </div>
                      <ItemActions onEdit={() => handleEditExperience(exp)} onDelete={() => handleDeleteExperience(exp.id)} />
                    </div>
                    {exp.description ? <p className="mt-2 text-sm leading-6 text-slate-600">{exp.description}</p> : null}
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState message="No experience yet. Add internships, volunteer roles, or campus work." />
            )}
          </div>
          ) : null}

          {showEducationSection ? (
          <div className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6">
            <SectionHeader title="Education" />
            <div className="relative border-l-2 border-emerald-100 pl-5">
              <span className="absolute -left-[9px] top-1 h-4 w-4 rounded-full border-4 border-white bg-emerald-500 shadow" />
              <h3 className="font-semibold text-slate-950">{student.branch || 'Degree / Branch'}</h3>
              <p className="text-sm text-slate-600">CampusLynk College</p>
              <p className="mt-1 text-xs font-medium uppercase tracking-wide text-slate-400">Year {student.year || '-'}</p>
            </div>
          </div>
          ) : null}
        </section>
        ) : null}

        {showSkillsSection ? (
        <section className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6">
          <SectionHeader title="Skills" onAdd={() => setActiveModal('skill')} />
          {skillsLoading ? (
            <LoadingIndicator label="Loading skills..." className="justify-start" size={20} />
          ) : displaySkills.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {displaySkills.map((skill) => (
                <Badge key={skill.id} className="group/skill rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-700 shadow-none">
                  {skill.name}
                  {isOwnProfile ? (
                    <button type="button" onClick={() => handleRemoveSkill(skill.id)} className="ml-2 opacity-70 transition hover:text-red-600 sm:opacity-0 sm:group-hover/skill:opacity-100" aria-label={`Remove ${skill.name}`}>
                      <X className="h-3 w-3" />
                    </button>
                  ) : null}
                </Badge>
              ))}
            </div>
          ) : (
            <EmptyState message="No skills yet. Add the tools and topics people should find you for." />
          )}
        </section>
        ) : null}

        {showCertificationsSection || showClubsSection ? (
        <section className="grid gap-8 lg:grid-cols-2">
          {showCertificationsSection ? (
          <div className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6">
            <SectionHeader title="Certifications" onAdd={() => setActiveModal('certification')} />
            {certificationsLoading ? (
              <LoadingIndicator label="Loading certifications..." className="justify-start" size={20} />
            ) : loadedCertifications.length > 0 ? (
              <div className="space-y-3">
                {loadedCertifications.map((cert) => (
                  <div key={cert.id} className="group flex items-center gap-4 rounded-2xl p-3 transition hover:bg-slate-50">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
                      <Trophy className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate font-medium text-slate-950">{cert.name}</h3>
                      <p className="text-sm text-slate-500">{cert.issuer || 'Certification issuer'}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      {cert.certificateUrl ? (
                        <a href={cert.certificateUrl} target="_blank" rel="noopener noreferrer" className="rounded-full p-2 text-slate-400 hover:bg-blue-50 hover:text-blue-600" aria-label="View certificate">
                          <Eye className="h-4 w-4" />
                        </a>
                      ) : null}
                      <ItemActions onEdit={() => handleEditCertification(cert)} onDelete={() => handleDeleteCertification(cert.id)} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState message="No certifications yet. Add credentials that back up your work." />
            )}
          </div>
          ) : null}

          {showClubsSection ? (
          <div className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6">
            <SectionHeader title="Clubs & Societies" onAdd={() => setActiveModal('society')} />
            {societies.length > 0 ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {societies.map((soc) => (
                  <div key={soc.id} className="group rounded-2xl border border-slate-100 bg-slate-50 p-4 transition hover:bg-white hover:shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
                          <Users className="h-5 w-5" />
                        </div>
                        <div>
                          <h3 className="font-medium text-slate-950">{soc.societyName}</h3>
                          <p className="text-sm text-slate-500">{soc.role}</p>
                        </div>
                      </div>
                      <ItemActions onEdit={() => handleEditSociety(soc)} onDelete={() => handleDeleteSociety(soc.id)} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState message="No clubs yet. Add communities, cells, or societies you are part of." />
            )}
          </div>
          ) : null}
        </section>
        ) : null}

        {showAchievementsSection ? (
        <section className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6">
          <SectionHeader title="Achievements" onAdd={() => setActiveModal('achievement')} />
          {achievements.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {achievements.map((ach) => (
                <div key={ach.id} className="group rounded-2xl border border-orange-100 bg-orange-50/70 p-4 transition hover:bg-white hover:shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-orange-100 text-orange-700">
                        <Award className="h-5 w-5" />
                      </div>
                      <h3 className="font-semibold text-slate-950">{ach.title}</h3>
                      <p className="text-sm text-slate-500">{ach.year}</p>
                      {ach.description ? <p className="mt-2 text-sm leading-6 text-slate-600">{ach.description}</p> : null}
                    </div>
                    <ItemActions onEdit={() => handleEditAchievement(ach)} onDelete={() => handleDeleteAchievement(ach.id)} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState message="No achievements yet. Add awards, hackathon wins, or milestones." />
          )}
        </section>
        ) : null}
      </div>

      {/* ===== MODALS ===== */}

      {/* Edit Profile Modal */}
      <Modal isOpen={activeModal === 'editProfile'} onClose={closeModal} title="Edit Profile" className="w-[min(40rem,calc(100vw-2rem))]" style={{ width: 'min(40rem, calc(100vw - 2rem))' }}>
        <div className="space-y-4 max-w-[560px] w-full">
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
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">About</label>
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
            <Button variant="outline" onClick={handleSaveProfile}>Save Changes</Button>
          </div>
        </div>
      </Modal>

      {/* About Modal */}
      <Modal isOpen={activeModal === 'about'} onClose={closeModal} title="Edit About" className="w-[min(40rem,calc(100vw-2rem))]" style={{ width: 'min(40rem, calc(100vw - 2rem))' }}>
        <div className="space-y-4 max-w-[560px] w-full">
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
            <Button variant="outline" onClick={handleSaveProfile}>Save</Button>
          </div>
        </div>
      </Modal>

      {/* Skill Modal */}
      <Modal isOpen={activeModal === 'skill'} onClose={closeModal} title="Add Skill" className="w-[min(28rem,calc(100vw-2rem))]" style={{ width: 'min(28rem, calc(100vw - 2rem))' }}>
        <div className="space-y-4 max-w-[420px] w-full">
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
            <Button variant="outline" onClick={handleAddSkill} disabled={!newSkillName.trim()}>
              Add Skill
            </Button>
          </div>
        </div>
      </Modal>

      {/* Experience Modal */}
      <Modal isOpen={activeModal === 'experience'} onClose={closeModal} title={editingItem ? 'Edit Experience' : 'Add Experience'} className="w-[min(48rem,calc(100vw-2rem))]" style={{ width: 'min(48rem, calc(100vw - 2rem))' }}>
        <div className="space-y-4 max-w-[640px] w-full">
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
              onCheckedChange={(checked: boolean | 'indeterminate') => setNewExperience({ ...newExperience, isCurrentlyWorking: checked === true })}
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
              variant="outline"
              onClick={handleAddExperience}
              disabled={!newExperience.roleTitle?.trim() || !newExperience.organization?.trim()}
            >
              {editingItem ? 'Update' : 'Add'} Experience
            </Button>
          </div>
        </div>
      </Modal>

      {/* Project Modal */}
      <Modal isOpen={activeModal === 'project'} onClose={closeModal} title={editingItem ? 'Edit Project' : 'Add Project'} className="w-[min(40rem,calc(100vw-2rem))]" style={{ width: 'min(40rem, calc(100vw - 2rem))' }}>
        <div className="space-y-4 max-h-[70vh] overflow-y-auto max-w-[560px] w-full">
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
                className="flex-1"
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
              variant="outline"
              onClick={handleAddProject}
              disabled={!newProject.title?.trim() || !newProject.description?.trim()}
            >
              {editingItem ? 'Update' : 'Add'} Project
            </Button>
          </div>
        </div>
      </Modal>

      {/* Certification Modal */}
      <Modal isOpen={activeModal === 'certification'} onClose={closeModal} title={editingItem ? 'Edit Certification' : 'Add Certification'} className="w-[min(36rem,calc(100vw-2rem))]" style={{ width: 'min(36rem, calc(100vw - 2rem))' }}>
        <div className="space-y-4 max-w-[520px] w-full">
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
              variant="outline"
              onClick={handleAddCertification}
              disabled={!newCertification.name?.trim()}
            >
              {editingItem ? 'Update' : 'Add'} Certification
            </Button>
          </div>
        </div>
      </Modal>

      {/* Society Modal */}
      <Modal isOpen={activeModal === 'society'} onClose={closeModal} title={editingItem ? 'Edit Society/Club' : 'Add Society/Club'} className="w-[min(40rem,calc(100vw-2rem))]" style={{ width: 'min(40rem, calc(100vw - 2rem))' }}>
        <div className="space-y-4 max-w-[560px] w-full">
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
              variant="outline"
              onClick={handleAddSociety}
              disabled={!newSociety.societyName?.trim() || !newSociety.role?.trim()}
            >
              {editingItem ? 'Update' : 'Add'} Society
            </Button>
          </div>
        </div>
      </Modal>

      {/* Achievement Modal */}
      <Modal isOpen={activeModal === 'achievement'} onClose={closeModal} title={editingItem ? 'Edit Achievement' : 'Add Achievement'} className="w-[min(36rem,calc(100vw-2rem))]" style={{ width: 'min(36rem, calc(100vw - 2rem))' }}>
        <div className="space-y-4 max-w-[520px] w-full">
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
              variant="outline"
              onClick={handleAddAchievement}
              disabled={!newAchievement.title?.trim() || !newAchievement.year}
            >
              {editingItem ? 'Update' : 'Add'} Achievement
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
