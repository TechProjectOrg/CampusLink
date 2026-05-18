import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import {
  Calendar,
  BookOpen,
  Edit2,
  ExternalLink,
  Plus,
  X,
  MessageCircle,
  Users,
  Trophy,
  Pencil,
  Trash2,
  Upload,
  Mail,
  Eye,
  Loader2,
  MoreHorizontal,
} from 'lucide-react';
import { Student, Opportunity } from '../types';
import type { FollowGraph } from '../App';
import { FollowButton } from './network/FollowButton';
import { useAuth } from '../context/AuthContext';
import { useAppDataStore } from '../context/AppDataContext';
import { apiAddUserSkill, apiDeleteUserSkill, apiFetchUserSkills, type UserSkill } from '../lib/skillsApi';
import {
  apiCreateUserCertification,
  apiFetchUserCertifications,
  apiDeleteUserCertification,
  apiUpdateUserCertification,
} from '../lib/certificationsApi';
import {
  apiCreateUserProject,
  apiDeleteUserProject,
  apiFetchUserProjects,
  apiUploadUserProjectImages,
  apiUpdateUserProject,
} from '../lib/projectsApi';
import { MultiImageUpload } from './ui/MultiImageUpload';
import { withOpportunityImages } from '../lib/mediaUtils';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Checkbox } from './ui/checkbox';
import { Modal } from './ui/modal';
import { DatePicker } from './ui/date-picker';
import { ImageWithFallback } from './figma/ImageWithFallback';
import { ProfilePhotoUpload } from './ui/profile-photo-upload';
import { BannerImageUpload } from './ui/banner-image-upload';
import {
  apiUpdateUserCoverPhoto,
  apiUpdateUserProfile,
  apiUpdateUserProfilePicture,
  apiUploadUserCoverPhoto,
  apiUploadUserProfilePicture,
} from '../lib/authApi';
import { OpportunityCard } from './OpportunityCard';
import { apiCreateUserPost, apiFetchProfilePosts, type UserPost } from '../lib/postsApi';
import { userPostToOpportunity } from '../lib/postMappers';
import { LoadingIndicator } from './ui/LoadingIndicator';
import { fetchCachedValue } from '../cache/socialCache';
import { cachePolicies } from '../cache/policies';
import { invalidateCache } from '../cache/client';
import { PageLayout } from './PageLayout';
import type { ReportTargetDescriptor } from './ReportDialog';
import {
  apiCreateUserExperience,
  apiDeleteUserExperience,
  apiFetchUserExperiences,
  apiUpdateUserExperience,
} from '../lib/experiencesApi';
import {
  apiCreateUserSociety,
  apiDeleteUserSociety,
  apiFetchUserSocieties,
  apiUpdateUserSociety,
} from '../lib/societiesApi';

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
  onBlockUser?: (userId: string) => Promise<void> | void;
  onUnblockUser?: (userId: string) => Promise<void> | void;
  postsRefreshToken?: number;
  onReportTarget?: (target: ReportTargetDescriptor) => void;
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

// Project type with image
interface Project {
  id: string;
  title: string;
  description: string;
  images?: string[];
  imageUrl?: string;
  githubUrl?: string;
  liveUrl?: string;
  tags: string[];
  company?: string;
  location?: string;
  deadline?: string;
  stipend?: string;
  duration?: string;
  link?: string;
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

type EducationLevel = '10th' | '12th' | "Bachelor's" | "Master's" | 'Other';

interface EducationRecord {
  id: string;
  level: EducationLevel;
  institution: string;
  branch: string;
  startYear: string;
  endYear: string;
  isPursuing: boolean;
  scoreType: 'percentage' | 'cgpa';
  score: string;
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
  onBlockUser,
  onUnblockUser,
  postsRefreshToken = 0,
  currentUserId,
  followGraph,
  onFollow,
  onUnfollow,
  onCancelRequest,
  onReportTarget,
}: ProfilePageProps) {
  const auth = useAuth();
  const appData = useAppDataStore();

  // Profile state
  const [editedStudent, setEditedStudent] = useState(student);

  // Skills state
  const [skills, setSkills] = useState<UserSkill[]>([]);
  const [skillsLoading, setSkillsLoading] = useState(false);
  const [newSkillName, setNewSkillName] = useState('');
  const [skillFormError, setSkillFormError] = useState<string | null>(null);

  // Certifications state
  const [loadedCertifications, setLoadedCertifications] = useState<Certification[]>([]);
  const [certificationsLoading, setCertificationsLoading] = useState(false);

  // Projects state
  const [loadedProjects, setLoadedProjects] = useState<Project[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [projectLikesById, setProjectLikesById] = useState<Record<string, { liked: boolean; count: number }>>({});
  const [loadedPosts, setLoadedPosts] = useState<Opportunity[]>([]);
  const [postsLoading, setPostsLoading] = useState(false);

  // Experience state
  const [experiences, setExperiences] = useState<Experience[]>([]);

  // Societies state
  const [societies, setSocieties] = useState<Society[]>([]);

  // Modal states
  const [activeModal, setActiveModal] = useState<
    | 'editProfile'
    | 'editBanner'
    | 'about'
    | 'skill'
    | 'experience'
    | 'project'
    | 'certification'
    | 'society'
    | 'education'
    | null
  >(null);

  // Edit item states (for editing existing items)
  const [editingItem, setEditingItem] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [pendingDeleteByKey, setPendingDeleteByKey] = useState<Record<string, boolean>>({});
  const [showProfileActions, setShowProfileActions] = useState(false);
  const [showBlockConfirm, setShowBlockConfirm] = useState(false);

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
    company: '',
    location: '',
    deadline: '',
    stipend: '',
    duration: '',
    link: '',
  });
  const [projectImageFiles, setProjectImageFiles] = useState<File[]>([]);
  const [projectExistingImages, setProjectExistingImages] = useState<string[]>([]);
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

  const [educationDraft, setEducationDraft] = useState({
    branch: student.branch || '',
    year: student.year ? String(student.year) : '',
  });
  const [shareCertificationAsPost, setShareCertificationAsPost] = useState(false);
  const [certPreview, setCertPreview] = useState<{
    url: string;
    title: string;
    issuer?: string;
    issueDate?: Date;
    description?: string;
    certificateUrl?: string;
  } | null>(null);
  const [educationRecords, setEducationRecords] = useState<EducationRecord[]>([]);
  const [editingEducationId, setEditingEducationId] = useState<string | null>(null);
  const [educationForm, setEducationForm] = useState<EducationRecord | null>(null);

  const authUserId = auth.currentUser?.id ?? auth.session?.userId;
  const authToken = auth.session?.token;

  // Load data
  const loadSkills = async (mode: 'cache-first' | 'network-only' = 'cache-first') => {
    if (!isOwnProfile || !authUserId) return;
    setSkillsLoading(true);
    try {
      const list = await fetchCachedValue({
        key: `page:user:${authUserId}:profile:skills`,
        policy: cachePolicies.userProfile,
        mode,
        fetcher: () => apiFetchUserSkills(authUserId, authToken),
        onCached: (cached) => setSkills(cached),
      });
      setSkills(list);
    } catch {
      setSkills([]);
    } finally {
      setSkillsLoading(false);
    }
  };

  const loadCertifications = async (mode: 'cache-first' | 'network-only' = 'cache-first') => {
    if (!student.id) return;
    setCertificationsLoading(true);
    try {
      const list = await fetchCachedValue({
        key: `page:user:${student.id}:profile:certifications`,
        policy: cachePolicies.userProfile,
        mode,
        fetcher: () => apiFetchUserCertifications(student.id, authToken),
      });
      setLoadedCertifications(
        list.map((item) => ({
          id: item.id,
          name: item.name,
          issuer: item.issuer || undefined,
          description: item.description || undefined,
          imageUrl: item.imageUrl || undefined,
          certificateUrl: item.credentialUrl || undefined,
          issueDate: item.issuedAt ? new Date(item.issuedAt) : undefined,
        })),
      );
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
      const list = await fetchCachedValue({
        key: `page:user:${student.id}:profile:projects`,
        policy: cachePolicies.userProfile,
        mode: 'network-only',
        fetcher: () => apiFetchUserProjects(student.id, authToken),
      });
      setLoadedProjects(
        list.map((item) => ({
          id: item.id,
          title: item.title,
          description: item.description,
          images: item.images,
          imageUrl: item.imageUrl || undefined,
          githubUrl: item.sourceUrl || undefined,
          liveUrl: item.demoUrl || item.link || undefined,
          tags: item.tags,
        })),
      );
    } catch {
      setLoadedProjects([]);
    } finally {
      setProjectsLoading(false);
    }
  };

  const loadExperiences = async (mode: 'cache-first' | 'network-only' = 'cache-first') => {
    if (!student.id) {
      console.warn('Cannot load experiences: student.id not set');
      return;
    }
    try {
      const list = await fetchCachedValue({
        key: `page:user:${student.id}:profile:experiences`,
        policy: cachePolicies.userProfile,
        mode,
        fetcher: () => apiFetchUserExperiences(student.id, authToken),
      });
      setExperiences(
        list.map((item) => ({
          id: item.id,
          roleTitle: item.roleTitle,
          organization: item.organization,
          description: item.description || '',
          startDate: new Date(item.startDate),
          endDate: item.endDate ? new Date(item.endDate) : undefined,
          isCurrentlyWorking: item.isCurrentlyWorking,
        })),
      );
      console.log('✓ Loaded experiences:', list.length);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error('✗ Error loading experiences:', errorMsg);
      setExperiences([]);
    }
  };

  const loadSocieties = async () => {
    if (!student.id) {
      console.warn('Cannot load societies: student.id not set');
      return;
    }
    try {
      const list = await fetchCachedValue({
        key: `page:user:${student.id}:profile:societies`,
        policy: cachePolicies.userProfile,
        mode: 'network-only',
        fetcher: () => apiFetchUserSocieties(student.id, authToken),
      });
      setSocieties(
        list.map((item) => ({
          id: item.id,
          societyName: item.societyName,
          role: item.role,
          startDate: item.startDate ? new Date(item.startDate) : new Date(),
          endDate: item.endDate ? new Date(item.endDate) : undefined,
        })),
      );
      console.log('✓ Loaded societies:', list.length);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error('✗ Error loading societies:', errorMsg);
      setSocieties([]);
    }
  };

  const mapApiPostToOpportunity = (post: UserPost): Opportunity =>
    userPostToOpportunity(post, { [student.id]: student }, null);

  const loadPosts = async () => {
    if (!student.id) return;
    setPostsLoading(true);
    try {
      const list = await fetchCachedValue({
        key: `page:user:${student.id}:profile:activities`,
        policy: cachePolicies.userProfile,
        mode: 'cache-first',
        fetcher: () => apiFetchProfilePosts(student.id, authToken),
        onCached: (cached) => setLoadedPosts(cached.map(mapApiPostToOpportunity)),
      });
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
    loadExperiences();
    loadSocieties();
  }, [student.id, authToken]);

  useEffect(() => {
    loadPosts();
  }, [student.id, authToken, isOwnProfile, authUserId, postsRefreshToken]);

  useEffect(() => {
    setEducationDraft({
      branch: student.branch || '',
      year: student.year ? String(student.year) : '',
    });
  }, [student.branch, student.year]);

  useEffect(() => {
    const storageKey = `profile-education:${student.id}`;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) {
        setEducationRecords([]);
        return;
      }
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        setEducationRecords([]);
        return;
      }
      const normalized = parsed
        .filter((item) => item && typeof item === 'object')
        .map((item): EducationRecord => ({
          id: typeof item.id === 'string' ? item.id : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          level: (['10th', '12th', "Bachelor's", "Master's", 'Other'].includes(item.level) ? item.level : 'Other') as EducationLevel,
          institution: typeof item.institution === 'string' ? item.institution : '',
          branch: typeof item.branch === 'string' ? item.branch : '',
          startYear: typeof item.startYear === 'string' ? item.startYear : '',
          endYear: typeof item.endYear === 'string' ? item.endYear : '',
          isPursuing: Boolean(item.isPursuing),
          scoreType: item.scoreType === 'cgpa' ? 'cgpa' : 'percentage',
          score: typeof item.score === 'string' ? item.score : '',
        }));
      setEducationRecords(normalized);
    } catch {
      setEducationRecords([]);
    }
  }, [student.id]);

  useEffect(() => {
    setBannerImage((isOwnProfile ? auth.profile?.coverPhotoUrl : student.coverPhotoUrl) ?? null);
  }, [isOwnProfile, auth.profile?.coverPhotoUrl, student.coverPhotoUrl]);

  // Follow counts
  const followersCount = student.stats?.followerCount ?? (followGraph.followersByUserId[student.id] ?? []).length;
  const followingCount = student.stats?.followingCount ?? (followGraph.followingByUserId[student.id] ?? []).length;
  const isFollowing = (followGraph.followingByUserId[currentUserId] ?? []).includes(student.id);
  const isFollower = (followGraph.followersByUserId[currentUserId] ?? []).includes(student.id);
  const requestStatus = (followGraph.outgoingRequestsByUserId[currentUserId] ?? []).includes(student.id)
    ? 'requested'
    : 'none';
  const profilePosts = [...loadedPosts].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const handleProfileLike = (opportunityId: string) => {
    setLoadedPosts((current) =>
      current.map((post) => {
        if (post.id !== opportunityId) return post;
        const currentlyLiked = post.isLikedByMe ?? false;
        return {
          ...post,
          isLikedByMe: !currentlyLiked,
          likeCount: Math.max((post.likeCount ?? 0) + (currentlyLiked ? -1 : 1), 0),
        };
      }),
    );
    onLike?.(opportunityId);
  };

  // Handlers
  const closeModal = () => {
    setActiveModal(null);
    setEditingItem(null);
    resetForms();
  };

  const resetForms = () => {
    setNewExperience({ roleTitle: '', organization: '', startDate: undefined, endDate: undefined, isCurrentlyWorking: false, description: '' });
    setNewProject({
      title: '',
      description: '',
      imageUrl: '',
      githubUrl: '',
      liveUrl: '',
      tags: [],
      company: '',
      location: '',
      deadline: '',
      stipend: '',
      duration: '',
      link: '',
    });
    setProjectImageFiles([]);
    setProjectExistingImages([]);
    setNewProjectTag('');
    setNewCertification({ name: '', issuer: '', issueDate: undefined, imageUrl: '', certificateUrl: '', description: '' });
    setCertImagePreview(null);
    setShareCertificationAsPost(false);
    setNewSociety({ societyName: '', role: '', startDate: undefined, endDate: undefined });
  };

  const handleSaveProfile = async () => {
    if (!isOwnProfile || !authUserId) return;
    setBusyAction('save-profile');
    try {
      await apiUpdateUserProfile(
        authUserId,
        {
          displayName: editedStudent.name?.trim(),
          username: editedStudent.username?.trim(),
          bio: editedStudent.bio?.trim() || null,
        },
        authToken,
      );
      onEdit?.({
        name: editedStudent.name,
        displayName: editedStudent.name,
        username: editedStudent.username,
        bio: editedStudent.bio,
      });
      await auth.refreshProfile();
      closeModal();
    } catch {}
    finally {
      setBusyAction(null);
    }
  };

  const currentProfilePhoto = isOwnProfile ? auth.profile?.profilePictureUrl ?? null : null;
  const hasCustomProfilePhoto = isOwnProfile && Boolean(auth.profile?.profilePictureUrl);
  const displayedProfilePhoto = isOwnProfile ? currentProfilePhoto ?? student.avatar : student.avatar;
  const [bannerImage, setBannerImage] = useState<string | null>(
    (isOwnProfile ? auth.profile?.coverPhotoUrl : student.coverPhotoUrl) ?? null,
  );

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

  const handleBannerChange = async (payload: { file?: File; previewUrl?: string; remove?: boolean }) => {
    if (!isOwnProfile || !authUserId) return;

    if (payload.remove) {
      await apiUpdateUserCoverPhoto(authUserId, null, authToken);
      setBannerImage(null);
      onEdit?.({ coverPhotoUrl: undefined });
      await auth.refreshProfile();
      return;
    }

    if (!payload.file) return;

    const profile = await apiUploadUserCoverPhoto(authUserId, payload.file, authToken);
    setBannerImage(profile.coverPhotoUrl ?? payload.previewUrl ?? null);
    onEdit?.({ coverPhotoUrl: profile.coverPhotoUrl || undefined });
    await auth.refreshProfile();
  };

  // Skill handlers
  const handleAddSkill = async () => {
    if (!isOwnProfile || !authUserId || !newSkillName.trim()) return;
    setSkillFormError(null);
    setBusyAction('save-skill');
    try {
      await apiAddUserSkill(authUserId, newSkillName.trim(), authToken);
      setNewSkillName('');
      await loadSkills('network-only');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to add skill';
      setSkillFormError(message);
    }
    finally {
      setBusyAction(null);
    }
  };

  const handleRemoveSkill = async (skillId: string) => {
    if (!isOwnProfile || !authUserId) return;
    if (!window.confirm('Remove this skill?')) return;
    const key = `skill:${skillId}`;
    setPendingDeleteByKey((prev) => ({ ...prev, [key]: true }));
    try {
      await apiDeleteUserSkill(authUserId, skillId, authToken);
      await loadSkills('network-only');
    } catch {}
    finally {
      setPendingDeleteByKey((prev) => ({ ...prev, [key]: false }));
    }
  };

  // Experience handlers
  const handleAddExperience = async () => {
    if (!authUserId) {
      console.error('Cannot add experience: authUserId not set');
      return;
    }
    if (!newExperience.roleTitle?.trim() || !newExperience.organization?.trim() || !newExperience.startDate) {
      console.error('Cannot add experience: missing required fields');
      return;
    }

    setBusyAction('save-experience');
    try {
      const payload = {
        roleTitle: newExperience.roleTitle.trim(),
        organization: newExperience.organization.trim(),
        description: newExperience.description?.trim() || '',
        startDate: newExperience.startDate.toISOString(),
        endDate: newExperience.isCurrentlyWorking ? null : newExperience.endDate?.toISOString() ?? null,
        isCurrentlyWorking: newExperience.isCurrentlyWorking || false,
      };

      if (editingItem) {
        await apiUpdateUserExperience(authUserId, editingItem, payload, authToken);
      } else {
        await apiCreateUserExperience(authUserId, payload, authToken);
      }
      await loadExperiences('network-only');
      closeModal();
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error('Error adding/updating experience:', errorMsg);
    } finally {
      setBusyAction(null);
    }
  };

  const handleEditExperience = (exp: Experience) => {
    setEditingItem(exp.id);
    setNewExperience(exp);
    setActiveModal('experience');
  };

  const handleDeleteExperience = async (id: string) => {
    if (!authUserId) {
      console.error('Cannot delete experience: authUserId not set');
      return;
    }
    if (!window.confirm('Delete this experience?')) return;
    const key = `experience:${id}`;
    setPendingDeleteByKey((prev) => ({ ...prev, [key]: true }));
    try {
      await apiDeleteUserExperience(authUserId, id, authToken);
      await loadExperiences('network-only');
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error('Error deleting experience:', errorMsg);
    } finally {
      setPendingDeleteByKey((prev) => ({ ...prev, [key]: false }));
    }
  };

  // Project handlers
  const handleAddProject = async () => {
    if (!newProject.title?.trim() || !newProject.description?.trim()) return;

    const project: Project = {
      id: editingItem || `proj-${Date.now()}`,
      title: newProject.title.trim(),
      description: newProject.description.trim(),
      githubUrl: newProject.githubUrl || '',
      liveUrl: newProject.liveUrl || '',
      tags: newProject.tags || [],
    };

    if (!authUserId) {
      window.alert('You must be logged in to add a project.');
      return;
    }

    try {
      const uploadedImageUrls =
        projectImageFiles.length > 0
          ? await apiUploadUserProjectImages(authUserId, projectImageFiles, authToken)
          : [];
      const projectImages = [...projectExistingImages, ...uploadedImageUrls].slice(0, 10);

      const payload = {
        title: project.title,
        description: project.description,
        sourceUrl: project.githubUrl,
        demoUrl: project.liveUrl,
        images: projectImages,
        tags: project.tags,
      };

      if (!editingItem) {
        const created = await apiCreateUserProject(authUserId, payload, authToken);
        const trimOrUndefined = (value?: string) => {
          const trimmed = value?.trim();
          return trimmed ? trimmed : undefined;
        };

        const createdPost = await apiCreateUserPost(
          authUserId,
          {
            postType: 'general',
            title: created.title,
            contentText: created.description,
            company: trimOrUndefined(newProject.company),
            location: trimOrUndefined(newProject.location),
            deadline: trimOrUndefined(newProject.deadline),
            stipend: trimOrUndefined(newProject.stipend),
            duration: trimOrUndefined(newProject.duration),
            externalUrl:
              trimOrUndefined(newProject.link) ??
              created.demoUrl ??
              created.sourceUrl ??
              undefined,
            hashtags: Array.from(new Set(['project', `project-${created.id}`, ...(created.tags ?? [])])),
            media: created.images.map((mediaUrl, sortOrder) => ({
              mediaUrl,
              mediaType: 'image',
              sortOrder,
            })),
          },
          authToken,
        );
        appData.prependPostToFeed(createdPost);
        setLoadedProjects((prev) => [
          {
            id: created.id,
            title: created.title,
            description: created.description,
            imageUrl: created.imageUrl ?? undefined,
            githubUrl: created.sourceUrl ?? undefined,
            liveUrl: created.demoUrl ?? undefined,
            tags: created.tags ?? [],
          },
          ...prev.filter((item) => item.id !== created.id),
        ]);
      } else {
        const updated = await apiUpdateUserProject(
          authUserId,
          editingItem,
          payload,
          authToken,
        );
        setLoadedProjects((prev) =>
          prev.map((item) =>
            item.id === updated.id
              ? {
                  ...item,
                  title: updated.title,
                  description: updated.description,
                  imageUrl: updated.imageUrl ?? undefined,
                  githubUrl: updated.sourceUrl ?? undefined,
                  liveUrl: updated.demoUrl ?? undefined,
                  tags: updated.tags ?? [],
                }
              : item,
          ),
        );
      }
      await loadProjects();
      closeModal();
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error('Error adding/updating project:', errorMsg);
      window.alert(`Unable to save project. ${errorMsg}`);
    } finally {
      setBusyAction(null);
    }
  };

  const mapProjectToOpportunity = (project: Project): Opportunity => ({
    ...(projectLikesById[project.id]
      ? {
          likeCount: projectLikesById[project.id].count,
          isLikedByMe: projectLikesById[project.id].liked,
        }
      : {}),
    id: `project-${project.id}`,
    authorId: student.id,
    authorName: student.name,
    authorAvatar: student.avatar,
    type: 'project',
    title: project.title,
    description: project.description,
    date: new Date().toISOString(),
    link: project.link || project.liveUrl || project.githubUrl || undefined,
    company: project.company,
    location: project.location,
    deadline: project.deadline,
    stipend: project.stipend,
    duration: project.duration,
    ...withOpportunityImages(
      project.images?.length
        ? project.images
        : project.imageUrl
          ? [project.imageUrl]
          : [],
    ),
    tags: Array.from(new Set(['project', ...(project.tags ?? [])])),
    likes: [],
    comments: [],
    saved: [],
    likeCount: projectLikesById[project.id]?.count ?? 0,
    commentCount: 0,
    saveCount: 0,
    isLikedByMe: projectLikesById[project.id]?.liked ?? false,
    isSavedByMe: false,
    canEdit: isOwnProfile,
    canDelete: isOwnProfile,
  });

  const handleEditProject = (project: Project) => {
    setEditingItem(project.id);
    setNewProject(project);
    setProjectExistingImages(
      project.images?.length ? project.images : project.imageUrl ? [project.imageUrl] : [],
    );
    setProjectImageFiles([]);
    setActiveModal('project');
  };

  const handleProjectLike = (projectId: string) => {
    setProjectLikesById((current) => {
      const previous = current[projectId] ?? { liked: false, count: 0 };
      const nextLiked = !previous.liked;
      return {
        ...current,
        [projectId]: {
          liked: nextLiked,
          count: Math.max(previous.count + (nextLiked ? 1 : -1), 0),
        },
      };
    });
  };

  const handleDeleteProject = async (id: string) => {
    if (!authUserId) {
      console.error('Cannot delete project: authUserId not set');
      return;
    }
    if (!window.confirm('Delete this project?')) return;
    const key = `project:${id}`;
    setPendingDeleteByKey((prev) => ({ ...prev, [key]: true }));
    try {
      await apiDeleteUserProject(authUserId, id, authToken);
      await loadProjects();
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error('Error deleting project:', errorMsg);
    } finally {
      setPendingDeleteByKey((prev) => ({ ...prev, [key]: false }));
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
      setBusyAction('save-certification');
      try {
        if (!editingItem) {
          await apiCreateUserCertification(authUserId, {
            name: newCertification.name.trim(),
            issuer: newCertification.issuer?.trim(),
            description: newCertification.description?.trim(),
            imageUrl: certImagePreview || newCertification.imageUrl,
            credentialUrl: newCertification.certificateUrl,
            issuedAt: newCertification.issueDate ? format(newCertification.issueDate, 'yyyy-MM-dd') : undefined,
          }, authToken);

          if (shareCertificationAsPost) {
            const certName = newCertification.name.trim();
            const issuer = newCertification.issuer?.trim() || '';
            const issuedLabel = newCertification.issueDate ? format(newCertification.issueDate, 'MMM yyyy') : '';
            const credentialUrl = newCertification.certificateUrl?.trim() || '';
            const lines = [
              `Earned a new certification: ${certName}`,
              issuer ? `Issuer: ${issuer}` : '',
              issuedLabel ? `Issued: ${issuedLabel}` : '',
              credentialUrl ? `Credential: ${credentialUrl}` : '',
            ].filter(Boolean);

            const createdPost = await apiCreateUserPost(
              authUserId,
              {
                postType: 'general',
                title: certName,
                contentText: lines.join('\n'),
                hashtags: ['certificate'],
              },
              authToken,
            );

            appData.prependPostToFeed(createdPost);
          }
        } else {
          await apiUpdateUserCertification(
            authUserId,
            editingItem,
            {
              name: newCertification.name.trim(),
              issuer: newCertification.issuer?.trim(),
              description: newCertification.description?.trim(),
              imageUrl: certImagePreview || newCertification.imageUrl,
              credentialUrl: newCertification.certificateUrl,
              issuedAt: newCertification.issueDate ? format(newCertification.issueDate, 'yyyy-MM-dd') : undefined,
            },
            authToken,
          );
        }
        await loadCertifications('network-only');
        closeModal();
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.error('Error adding/updating certification:', errorMsg);
      } finally {
        setBusyAction(null);
      }
    }
  };

  const handleEditCertification = (cert: Certification) => {
    setEditingItem(cert.id);
    setNewCertification(cert);
    setCertImagePreview(cert.imageUrl || null);
    setActiveModal('certification');
  };

  const handleDeleteCertification = async (id: string) => {
    if (!authUserId) {
      console.error('Cannot delete certification: authUserId not set');
      return;
    }
    if (!window.confirm('Delete this certification?')) return;
    const key = `certification:${id}`;
    setPendingDeleteByKey((prev) => ({ ...prev, [key]: true }));
    try {
      await apiDeleteUserCertification(authUserId, id, authToken);
      await loadCertifications('network-only');
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error('Error deleting certification:', errorMsg);
    } finally {
      setPendingDeleteByKey((prev) => ({ ...prev, [key]: false }));
    }
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
  const handleAddSociety = async () => {
    if (!authUserId) {
      console.error('Cannot add society: authUserId not set');
      return;
    }
    if (!newSociety.societyName?.trim() || !newSociety.role?.trim()) {
      console.error('Cannot add society: missing required fields');
      return;
    }

    setBusyAction('save-society');
    try {
      const payload = {
        societyName: newSociety.societyName.trim(),
        role: newSociety.role.trim(),
        startDate: newSociety.startDate ? newSociety.startDate.toISOString() : null,
        endDate: newSociety.endDate ? newSociety.endDate.toISOString() : null,
      };

      if (!editingItem) {
        await apiCreateUserSociety(authUserId, payload, authToken);
      } else {
        await apiUpdateUserSociety(authUserId, editingItem, payload, authToken);
      }

      await invalidateCache({
        reason: 'profile-society-updated',
        keys: [`page:user:${student.id}:profile:societies`],
      });
      await loadSocieties();
      closeModal();
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error('Error adding/updating society:', errorMsg);
    } finally {
      setBusyAction(null);
    }
  };

  const handleEditSociety = (soc: Society) => {
    setEditingItem(soc.id);
    setNewSociety(soc);
    setActiveModal('society');
  };

  const handleDeleteSociety = async (id: string) => {
    if (!authUserId) {
      console.error('Cannot delete society: authUserId not set');
      return;
    }
    if (!window.confirm('Delete this society/club entry?')) return;
    const key = `society:${id}`;
    setPendingDeleteByKey((prev) => ({ ...prev, [key]: true }));
    try {
      await apiDeleteUserSociety(authUserId, id, authToken);
      await invalidateCache({
        reason: 'profile-society-deleted',
        keys: [`page:user:${student.id}:profile:societies`],
      });
      await loadSocieties();
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error('Error deleting society:', errorMsg);
    } finally {
      setPendingDeleteByKey((prev) => ({ ...prev, [key]: false }));
    }
  };

  const handleSaveEducation = async () => {
    setBusyAction('save-education');
    try {
      try {
        window.localStorage.setItem(`profile-education:${student.id}`, JSON.stringify(educationRecords));
      } catch {}
      setActiveModal(null);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error('Error saving education:', errorMsg);
    } finally {
      setBusyAction(null);
    }
  };

  const displaySkills = isOwnProfile ? skills : student.skills.map((name, index) => ({ id: String(index), name }));
  const isBlockedByViewer = !isOwnProfile && student.viewerHasBlockedUser === true;
  const isRestrictedView = !isOwnProfile && student.profileVisibility === 'restricted';
  const profileEmail = student.email?.trim() || '';
  const profileBranch = student.branch?.trim() || '';
  const hasKnownBranch = Boolean(profileBranch && profileBranch.toLowerCase() !== 'unknown');
  const hasKnownYear = student.year > 0;
  const yearLabel = hasKnownYear ? `Year ${student.year}` : 'Year not added';
  const branchLabel = hasKnownBranch ? profileBranch : 'Branch not added';
  const clubCount = societies.length;
  const showPostsSection = !isBlockedByViewer && !isRestrictedView && (isOwnProfile || postsLoading || profilePosts.length > 0);
  const showProjectsSection = !isBlockedByViewer && !isRestrictedView && (isOwnProfile || projectsLoading || loadedProjects.length > 0);
  const showExperienceSection = !isBlockedByViewer && !isRestrictedView && (isOwnProfile || experiences.length > 0);
  const showEducationSection = !isBlockedByViewer && !isRestrictedView && (isOwnProfile || hasKnownBranch || hasKnownYear || educationRecords.length > 0);
  const showSkillsSection = !isBlockedByViewer && !isRestrictedView && (isOwnProfile || skillsLoading || displaySkills.length > 0);
  const showCertificationsSection = !isRestrictedView && (isOwnProfile || certificationsLoading || loadedCertifications.length > 0);
  const showClubsSection = !isBlockedByViewer && !isRestrictedView && (isOwnProfile || societies.length > 0);
  const profileSectionCardClass = 'box-border flex w-full min-w-0 flex-col gap-4 overflow-hidden break-words rounded-3xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5 lg:p-6';
  const educationLevelOrder: Record<EducationLevel, number> = {
    '10th': 1,
    '12th': 2,
    "Bachelor's": 3,
    "Master's": 4,
    Other: 5,
  };
  const orderedEducationRecords = [...educationRecords].sort((a, b) => {
    const levelDiff = educationLevelOrder[a.level] - educationLevelOrder[b.level];
    if (levelDiff !== 0) return levelDiff;
    const aYear = Number.parseInt(a.startYear, 10);
    const bYear = Number.parseInt(b.startYear, 10);
    if (!Number.isNaN(aYear) && !Number.isNaN(bYear) && aYear !== bYear) {
      return aYear - bYear;
    }
    return a.institution.localeCompare(b.institution);
  });

  const SectionHeader = ({
    title,
    subtitle,
    onAdd,
  }: {
    title: string;
    subtitle?: string;
    onAdd?: () => void;
  }) => (
    <div className="flex w-full items-center justify-between gap-4">
      <div className="min-w-0">
        <h2 className="break-words text-lg font-semibold tracking-tight text-slate-950 sm:text-xl">{title}</h2>
        {subtitle ? <p className="mt-1 text-sm text-slate-500">{subtitle}</p> : null}
      </div>
      {isOwnProfile && onAdd ? (
        <Button size="sm" onClick={onAdd} className="ml-auto shrink-0 rounded-full gradient-primary text-white shadow-md hover:shadow-lg transition-all border-none px-5 h-9 font-bold">
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

  const addEducationRecord = () => {
    setEditingEducationId('new');
    setEducationForm({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      level: 'Other',
      institution: '',
      branch: '',
      startYear: '',
      endYear: '',
      isPursuing: false,
      scoreType: 'percentage',
      score: '',
    });
  };

  const updateEducationRecordForm = (updates: Partial<EducationRecord>) => {
    setEducationForm((prev) => (prev ? { ...prev, ...updates } : prev));
  };

  const removeEducationRecord = (id: string) => {
    setEducationRecords((prev) => prev.filter((record) => record.id !== id));
  };

  const startEditEducationRecord = (record: EducationRecord) => {
    setEditingEducationId(record.id);
    setEducationForm({ ...record });
  };

  const cancelEducationForm = () => {
    setEditingEducationId(null);
    setEducationForm(null);
  };

  const saveEducationRecordForm = () => {
    if (!educationForm) return;
    if (editingEducationId === 'new') {
      setEducationRecords((prev) => [...prev, educationForm]);
    } else {
      setEducationRecords((prev) => prev.map((record) => (record.id === educationForm.id ? educationForm : record)));
    }
    cancelEducationForm();
  };

  // Item Actions Component
  const ItemActions = ({ onEdit, onDelete, deleting = false }: { onEdit: () => void; onDelete: () => void; deleting?: boolean }) => (
    isOwnProfile ? (
      <div className="flex items-center gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
        <button type="button" disabled={deleting} onClick={onEdit} className="rounded-full p-1.5 text-slate-400 transition-colors hover:bg-blue-50 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-50" aria-label="Edit item">
          <Pencil className="w-4 h-4" />
        </button>
        <button type="button" disabled={deleting} onClick={onDelete} className="rounded-full p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50" aria-label="Delete item">
          {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
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
    <PageLayout maxWidth="4xl" className="bg-slate-50 pb-24 md:pb-8" contentClassName="py-4 sm:py-5 lg:py-6 max-w-[720px]">
      <div className="mx-auto grid w-full [grid-template-columns:1fr] gap-4" style={{ maxWidth: '1000px' }}>
        {/* Modern Profile Header: Cover + Overlapping Avatar + Stacked Content */}
        <section className="cl-profile-header relative bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden">
          <div className="mx-auto w-full max-w-[1000px]">
          
          {/* Banner/Cover Section */}
          <div className="cl-cover-section relative h-48 sm:h-64 md:h-72 w-full flex-shrink-0 overflow-hidden bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-600 bg-cover bg-center">
            {bannerImage ? (
              <img
                src={bannerImage}
                alt="Profile banner"
                className="absolute inset-0 h-full w-full object-cover object-center"
              />
            ) : null}
            <div className="absolute inset-0 bg-black/5" />

            {!isOwnProfile ? (
              <div className="absolute right-4 top-4 z-30">
                <button
                  type="button"
                  onClick={() => setShowProfileActions((current) => !current)}
                  className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-white/90 bg-white/20 text-white shadow-lg backdrop-blur-md transition hover:scale-105 hover:bg-white/30"
                  aria-label="Profile actions"
                >
                  <MoreHorizontal className="h-5 w-5" />
                </button>
                {showProfileActions ? (
                  <div className="absolute right-0 mt-3 w-56 rounded-3xl border border-slate-200 bg-white p-2.5 shadow-2xl">
                    <button
                      type="button"
                      onClick={() => {
                        setShowProfileActions(false);
                        if (isBlockedByViewer) {
                          void onUnblockUser?.(student.id);
                        } else {
                          setShowBlockConfirm(true);
                        }
                      }}
                      className="block w-full whitespace-nowrap rounded-2xl px-4 py-3 text-left text-base font-semibold text-red-600 transition hover:bg-red-50"
                    >
                      {isBlockedByViewer ? 'Unblock User' : 'Block User'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowProfileActions(false);
                        onReportTarget?.({
                          targetType: 'user',
                          targetId: student.id,
                          label: student.name,
                          preview: student.bio || student.branch || student.username,
                        });
                      }}
                      className="mt-1.5 block w-full whitespace-nowrap rounded-2xl px-4 py-3 text-left text-base font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                      Report User
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
            
            {/* Banner Edit Button (Owner Only) */}
            {isOwnProfile && (
              <BannerImageUpload onBannerChange={handleBannerChange} />
            )}
          </div>

          {/* Avatar Container - Centered on Banner/Content Separation Line */}
          <div className="cl-avatar-container relative px-6 sm:px-10 pb-6">
            <div className="flex items-end gap-4 sm:gap-6 -mt-16 sm:-mt-20 md:-mt-24 mb-4 sm:mb-6">
              {/* Circular Avatar - Centered on Separation Line */}
              <div className="cl-avatar-wrapper flex-shrink-0">
                <div className="w-32 h-32 sm:w-40 sm:h-40 md:w-48 md:h-48 rounded-full border-4 sm:border-[5px] border-white bg-white shadow-lg overflow-hidden flex items-center justify-center flex-shrink-0">
                  <ProfilePhotoUpload
                    currentPhoto={displayedProfilePhoto}
                    hasCustomPhoto={hasCustomProfilePhoto}
                    name={student.name}
                    editable={isOwnProfile}
                    onPhotoChange={handleProfilePhotoChange}
                    fill={true}
                  />
                </div>
              </div>

              {/* Action Buttons Aligned to Bottom of Avatar */}
              <div className="cl-actions-beside-avatar flex flex-col gap-2 flex-shrink-0">
                {!isOwnProfile ? (
                  <div className="flex items-center gap-2 sm:gap-3">
                    {isBlockedByViewer ? (
                      <Button
                        onClick={() => onUnblockUser?.(student.id)}
                        className="rounded-full bg-red-600 px-4 sm:px-6 h-10 sm:h-11 font-semibold text-white shadow-md hover:bg-red-700 text-sm sm:text-base"
                      >
                        Unblock
                      </Button>
                    ) : (
                      <>
                        {!isRestrictedView ? (
                          <FollowButton
                            targetName={student.name}
                            accountType={student.accountType}
                            isFollowing={isFollowing}
                            isFollower={isFollower}
                            requestStatus={requestStatus}
                            className="w-auto rounded-full gradient-primary px-4 sm:px-6 h-10 sm:h-11 font-semibold text-white shadow-md hover:shadow-lg transition-all border-none text-sm sm:text-base"
                            onFollow={() => onFollow(student.id, student.accountType)}
                            onUnfollow={() => onUnfollow(student.id)}
                            onCancelRequest={() => onCancelRequest(student.id)}
                          />
                        ) : null}
                        {!isRestrictedView ? (
                          <Button 
                            onClick={() => onMessage?.(student.id)}
                            className="rounded-full gradient-primary px-4 sm:px-6 h-10 sm:h-11 font-semibold text-white shadow-md hover:shadow-lg transition-all border-none text-sm sm:text-base"
                          >
                            <MessageCircle className="mr-2 h-4 w-4" />
                            Message
                          </Button>
                        ) : null}
                      </>
                    )}
                  </div>
                ) : (
                  <Button 
                    onClick={() => setActiveModal('editProfile')}
                    className="rounded-full gradient-primary px-4 sm:px-6 h-10 sm:h-11 font-semibold text-white shadow-md hover:shadow-lg transition-all border-none text-sm sm:text-base"
                  >
                    <Edit2 className="mr-2 h-4 w-4" />
                    Edit
                  </Button>
                )}
              </div>
            </div>

            {/* Profile Information Stack */}
            <div className="cl-profile-details space-y-3 sm:space-y-4">
              
              {/* Name and Title Row */}
              <div className="cl-name-section">
                <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-slate-900 leading-tight">
                  {student.name}
                </h1>
                <p className="mt-1 text-sm font-medium text-slate-500">@{student.username}</p>
              </div>

              {/* About Preview Row */}
              {!isRestrictedView && (isOwnProfile || Boolean(student.bio?.trim())) ? (
                <div className="cl-about-preview-section">
                  <p className="text-base sm:text-lg text-slate-600 leading-relaxed max-w-2xl">
                    {student.bio?.trim() || 'Add an about section so people can know you better.'}
                  </p>
                </div>
              ) : null}

              {/* Location, Year, Email Row */}
              {!isRestrictedView ? (
              <div className="cl-metadata-row flex flex-wrap items-center gap-4 sm:gap-6 text-sm">
                <div className="flex items-center gap-2 text-slate-600">
                  <Mail className="w-4 h-4 flex-shrink-0 text-slate-400" />
                  <span className="truncate">{profileEmail || 'Email not added'}</span>
                </div>
                <div className="flex items-center gap-2 text-slate-600">
                  <Calendar className="w-4 h-4 flex-shrink-0 text-slate-400" />
                  <span>{yearLabel}</span>
                </div>
                <div className="flex items-center gap-2 text-slate-600">
                  <BookOpen className="w-4 h-4 flex-shrink-0 text-slate-400" />
                  <span>{branchLabel}</span>
                </div>
              </div>
              ) : null}

              {/* Stats Row */}
              <div className="cl-stats-row flex flex-wrap items-center gap-6 sm:gap-8 pt-2 sm:pt-3 border-t border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="text-lg sm:text-xl font-bold text-slate-900">{followersCount}</span>
                  <span className="text-sm sm:text-base text-slate-500 font-medium">Followers</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-lg sm:text-xl font-bold text-slate-900">{followingCount}</span>
                  <span className="text-sm sm:text-base text-slate-500 font-medium">Following</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-lg sm:text-xl font-bold text-slate-900">{loadedProjects.length}</span>
                  <span className="text-sm sm:text-base text-slate-500 font-medium">Projects</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-lg sm:text-xl font-bold text-slate-900">{clubCount}</span>
                  <span className="text-sm sm:text-base text-slate-500 font-medium">Clubs</span>
                </div>
              </div>
              {isBlockedByViewer ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  You blocked this user.
                </div>
              ) : null}
            </div>
          </div>
          </div>
        </section>

        {isBlockedByViewer ? (
          <section className={profileSectionCardClass}>
            <EmptyState message="You blocked this user." />
          </section>
        ) : null}

        {isRestrictedView ? (
          <section className={profileSectionCardClass}>
            <EmptyState message="This profile is unavailable." />
          </section>
        ) : null}

        {!isBlockedByViewer && !isRestrictedView && showPostsSection ? (
        <section className={profileSectionCardClass}>
          <SectionHeader title="Activity" />
          {postsLoading ? (
            <LoadingIndicator label="Loading posts..." className="justify-start" size={20} />
          ) : profilePosts.length > 0 ? (
            <>
              <div className="overflow-hidden">
                <div
                  className="hide-scrollbar w-full overflow-x-auto overscroll-x-contain pb-2"
                  onWheel={handleHorizontalWheel}
                >
                  <div className="flex w-full snap-x snap-mandatory gap-4 sm:w-max sm:gap-5">
                    {profilePosts.slice(0, 8).map((post) => (
                      <div key={post.id} className="w-full shrink-0 snap-start sm:w-[22rem]">
                        <OpportunityCard
                          opportunity={post}
                          currentUserId={currentUserId}
                          showManagementControls={isOwnProfile}
                          onLike={handleProfileLike}
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
              <Button variant="outline" className="w-full rounded-2xl border-slate-200 bg-white text-slate-800 shadow-sm transition-transform duration-200 hover:scale-[1.02]" onClick={() => onShowAllPosts?.(student.id)}>
                Show all posts
              </Button>
            </>
          ) : (
            <EmptyState message="Share updates, posts, and campus activity." />
          )}
        </section>
        ) : null}

        {!isBlockedByViewer && !isRestrictedView && showProjectsSection ? (
        <section className={profileSectionCardClass}>
          <SectionHeader title="Projects" onAdd={() => setActiveModal('project')} />
          {projectsLoading ? (
            <LoadingIndicator label="Loading projects..." className="justify-start" size={20} />
          ) : loadedProjects.length > 0 ? (
            <>
              <div className="overflow-hidden">
                <div
                  className="hide-scrollbar w-full overflow-x-auto overscroll-x-contain pb-2"
                  onWheel={handleHorizontalWheel}
                >
                <div className="flex w-full snap-x snap-mandatory gap-4 sm:w-max">
                  {loadedProjects.map((project) => (
                    <div key={project.id} className="w-full shrink-0 snap-start sm:w-[22rem]">
                      <OpportunityCard
                        opportunity={mapProjectToOpportunity(project)}
                        currentUserId={currentUserId}
                        showManagementControls={isOwnProfile}
                        onLike={() => handleProjectLike(project.id)}
                        onSave={(id) => onSave?.(id)}
                        onComment={(id, comment) => onComment?.(id, comment)}
                        onReply={(commentId, comment) => onReply?.(commentId, comment)}
                        onLikeComment={(commentId, alreadyLiked) => onLikeComment?.(commentId, alreadyLiked)}
                        onDeleteComment={(commentId) => onDeleteComment?.(commentId)}
                        onEditPost={() => handleEditProject(project)}
                        onDeletePost={() => handleDeleteProject(project.id)}
                        onOpenPost={onOpenPost}
                        onViewProfile={() => undefined}
                      />
                    </div>
                  ))}
                </div>
                </div>
              </div>
              <Button variant="outline" className="w-full rounded-2xl border-slate-200 bg-white text-slate-800 shadow-sm transition-transform duration-200 hover:scale-[1.02]" onClick={() => onShowAllProjects?.(student.id)}>
                Show all projects
              </Button>
            </>
          ) : (
            <EmptyState message="Showcase your projects and work." />
          )}
        </section>
        ) : null}

        {!isBlockedByViewer && !isRestrictedView && (showExperienceSection || showEducationSection) ? (
        <section className="grid w-full [grid-template-columns:1fr] gap-4">
          {showExperienceSection ? (
          <div className={profileSectionCardClass}>
            <SectionHeader title="Experience" onAdd={() => setActiveModal('experience')} />
            {experiences.length > 0 ? (
              <div className="flex flex-col gap-4">
                {experiences.map((exp) => (
                  <div
                    key={exp.id}
                    className="rounded-2xl border border-slate-200/80 bg-slate-50/80 p-4 shadow-sm transition-colors duration-200 hover:border-blue-200 hover:bg-white"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="break-words text-lg font-semibold text-slate-900">{exp.roleTitle}</h3>
                        <p className="mt-1 text-sm font-medium text-slate-600">{exp.organization}</p>
                        <p className="mt-2 inline-flex rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                          {format(exp.startDate, 'MMM yyyy')} - {exp.isCurrentlyWorking ? 'Present' : exp.endDate ? format(exp.endDate, 'MMM yyyy') : 'Present'}
                        </p>
                      </div>
                      <ItemActions
                        onEdit={() => handleEditExperience(exp)}
                        onDelete={() => handleDeleteExperience(exp.id)}
                        deleting={Boolean(pendingDeleteByKey[`experience:${exp.id}`])}
                      />
                    </div>
                    {exp.description ? <p className="mt-3 text-sm leading-6 text-slate-700">{exp.description}</p> : null}
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState message="Add your work and internship experience." />
            )}
          </div>
          ) : null}

          {showEducationSection ? (
          <div className={profileSectionCardClass}>
            <SectionHeader 
              title="Education" 
              onAdd={() => setActiveModal('education')} 
            />
            {educationRecords.length > 0 || hasKnownBranch || hasKnownYear ? (
              <div className="flex flex-col gap-3">
                {orderedEducationRecords.map((record) => (
                  <div key={record.id} className="rounded-2xl border border-slate-200/80 bg-slate-50/80 p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="break-words text-base font-semibold text-slate-900">{record.level}</h3>
                        <p className="mt-1 break-words text-sm text-slate-600">{record.institution || 'Institution not added'}</p>
                        <p className="mt-1 text-xs font-medium uppercase tracking-wide text-slate-500">
                          {record.level === '10th' || record.level === '12th'
                            ? `Year ${record.startYear || 'Not added'}`
                            : `${record.isPursuing ? 'Currently pursuing' : 'Completed'}${record.startYear ? ` • ${record.startYear}` : ''}${record.endYear ? ` - ${record.endYear}` : ''}`}
                        </p>
                        {(record.branch || record.score) ? (
                          <p className="mt-2 text-sm text-slate-700">
                            {record.branch ? `${record.branch}` : ''}
                            {record.branch && record.score ? ' • ' : ''}
                            {record.score ? `${record.scoreType === 'cgpa' ? 'CGPA' : 'Percentage'}: ${record.score}` : ''}
                          </p>
                        ) : null}
                        {(record.level === "Bachelor's" || record.level === "Master's") && record.isPursuing && hasKnownYear ? (
                          <p className="mt-1 text-sm font-medium text-emerald-700">Current Year: {student.year}</p>
                        ) : null}
                      </div>
                      {isOwnProfile ? (
                        <button
                          type="button"
                          onClick={() => removeEducationRecord(record.id)}
                          className="rounded-full p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
                          aria-label="Remove education entry"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))}
                {(hasKnownBranch || hasKnownYear) ? (
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
                    <p className="text-sm font-semibold text-emerald-900">Current Campus Profile</p>
                    <p className="mt-1 text-sm text-emerald-800">
                      {hasKnownBranch ? profileBranch : 'Branch not added'}
                      {hasKnownYear ? ` • Year ${student.year}` : ''}
                    </p>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="flex items-start gap-3">
                <span className="mt-1 h-3.5 w-3.5 flex-shrink-0 rounded-full bg-emerald-500 shadow-sm" />
                <div className="min-w-0">
                  <p className="mt-1 text-xs font-medium uppercase tracking-wide text-slate-400">
                    Academic details not added yet
                  </p>
                </div>
              </div>
            )}
          </div>
          ) : null}
        </section>
        ) : null}

        {!isBlockedByViewer && !isRestrictedView && showSkillsSection ? (
        <section className={profileSectionCardClass}>
          <SectionHeader title="Skills" onAdd={() => setActiveModal('skill')} />
          {skillsLoading ? (
            <LoadingIndicator label="Loading skills..." className="justify-start" size={20} />
          ) : displaySkills.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {displaySkills.map((skill) => (
                <Badge key={skill.id} className="group/skill rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-700 shadow-none">
                  {skill.name}
                  {isOwnProfile ? (
                    <button type="button" disabled={Boolean(pendingDeleteByKey[`skill:${skill.id}`])} onClick={() => handleRemoveSkill(skill.id)} className="ml-2 opacity-70 transition hover:text-red-600 sm:opacity-0 sm:group-hover/skill:opacity-100 disabled:cursor-not-allowed disabled:opacity-50" aria-label={`Remove ${skill.name}`}>
                      {pendingDeleteByKey[`skill:${skill.id}`] ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
                    </button>
                  ) : null}
                </Badge>
              ))}
            </div>
          ) : (
            <EmptyState message="Add your skills to showcase your strengths." />
          )}
        </section>
        ) : null}

        {!isBlockedByViewer && !isRestrictedView && (showCertificationsSection || showClubsSection) ? (
        <section className="grid w-full [grid-template-columns:1fr] gap-4">
          {showCertificationsSection ? (
          <div className={profileSectionCardClass}>
            <SectionHeader title="Certifications" onAdd={() => setActiveModal('certification')} />
            {certificationsLoading ? (
              <LoadingIndicator label="Loading certifications..." className="justify-start" size={20} />
            ) : loadedCertifications.length > 0 ? (
              <div className="flex flex-col gap-3">
                {loadedCertifications.map((cert) => (
                  <div key={cert.id} className="group rounded-2xl border border-slate-200/80 bg-white p-3 shadow-sm transition hover:border-blue-200">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <h3 className="break-words font-medium text-slate-950">{cert.name}</h3>
                        <p className="text-sm text-slate-500">{cert.issuer || 'Certification issuer'}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        {cert.certificateUrl ? (
                          <a href={cert.certificateUrl} target="_blank" rel="noopener noreferrer" className="rounded-full p-2 text-slate-400 hover:bg-blue-50 hover:text-blue-600" aria-label="View certificate">
                            <Eye className="h-4 w-4" />
                          </a>
                        ) : null}
                        <ItemActions
                          onEdit={() => handleEditCertification(cert)}
                          onDelete={() => handleDeleteCertification(cert.id)}
                          deleting={Boolean(pendingDeleteByKey[`certification:${cert.id}`])}
                        />
                      </div>
                    </div>
                    {cert.imageUrl ? (
                      <div
                        className="relative mt-3 w-full overflow-hidden rounded-xl group cursor-pointer"
                        onClick={() =>
                          setCertPreview({
                            url: cert.imageUrl as string,
                            title: cert.name,
                            issuer: cert.issuer,
                            issueDate: cert.issueDate,
                            description: cert.description,
                            certificateUrl: cert.certificateUrl,
                          })
                        }
                      >
                        <ImageWithFallback
                          src={cert.imageUrl}
                          alt={cert.name}
                          className="h-80 w-full object-cover transition-transform duration-500 group-hover:scale-105"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                      </div>
                    ) : (
                      <div className="mt-3 flex h-20 w-full items-center justify-center rounded-xl bg-amber-50 text-amber-600">
                        <Trophy className="h-6 w-6" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState message="Add certifications and credentials." />
            )}
          </div>
          ) : null}

          {showClubsSection ? (
          <div className={profileSectionCardClass}>
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
                          <h3 className="break-words font-medium text-slate-950">{soc.societyName}</h3>
                          <p className="text-sm text-slate-500">{soc.role}</p>
                        </div>
                      </div>
                      <ItemActions
                        onEdit={() => handleEditSociety(soc)}
                        onDelete={() => handleDeleteSociety(soc.id)}
                        deleting={Boolean(pendingDeleteByKey[`society:${soc.id}`])}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState message="Show your communities and campus involvement." />
            )}
          </div>
          ) : null}
        </section>
        ) : null}

      </div>

      {/* ===== MODALS ===== */}

      {/* Edit Profile Modal */}
      <Modal
        isOpen={showBlockConfirm}
        onClose={() => setShowBlockConfirm(false)}
        title={`Block @${student.username}?`}
        className="w-[min(28rem,calc(100vw-2rem))]"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            They will no longer be able to interact with you or view your profile details.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowBlockConfirm(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={async () => {
                setShowBlockConfirm(false);
                await onBlockUser?.(student.id);
              }}
            >
              Block User
            </Button>
          </div>
        </div>
      </Modal>

      {/* Edit Profile Modal */}
      <Modal isOpen={activeModal === 'editProfile'} onClose={closeModal} title="Edit Profile" className="w-[min(40rem,calc(100vw-2rem))]" style={{ width: 'min(40rem, calc(100vw - 2rem))' }}>
        <div className="space-y-4 max-w-[560px] w-full">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Display Name</label>
            <Input
              value={editedStudent.name}
              onChange={(e) => setEditedStudent({ ...editedStudent, name: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
            <Input
              value={editedStudent.username}
              onChange={(e) => setEditedStudent({ ...editedStudent, username: e.target.value })}
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
            <Button disabled={busyAction === 'save-profile'} onClick={handleSaveProfile} className="rounded-full gradient-primary text-white shadow-md hover:shadow-lg transition-all border-none font-bold disabled:opacity-70">
              {busyAction === 'save-profile' ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* About Modal */}
      <Modal isOpen={activeModal === 'about'} onClose={closeModal} title="Edit About" className="w-[min(40rem,calc(100vw-2rem))]" style={{ width: 'min(40rem, calc(100vw - 2rem))' }}>
        <div className="space-y-4 max-w-[560px] w-full">
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
            <Button disabled={busyAction === 'save-profile'} onClick={handleSaveProfile} className="rounded-full gradient-primary text-white shadow-md hover:shadow-lg transition-all border-none font-bold disabled:opacity-70">
              {busyAction === 'save-profile' ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Skill Modal */}
      <Modal isOpen={activeModal === 'skill'} onClose={closeModal} title="Manage Skills" className="w-[min(34rem,calc(100vw-2rem))]" style={{ width: 'min(34rem, calc(100vw - 2rem))' }}>
        <div className="space-y-5 max-w-[520px] w-full">
          <div>
            <p className="mb-2 text-sm font-medium text-gray-700">Added Skills</p>
            {skillsLoading ? (
              <LoadingIndicator label="Loading skills..." className="justify-start" size={18} />
            ) : skills.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {skills.map((skill) => (
                  <Badge key={skill.id} className="group/skill rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-700 shadow-none">
                    {skill.name}
                    <button
                      type="button"
                      disabled={Boolean(pendingDeleteByKey[`skill:${skill.id}`])}
                      onClick={() => handleRemoveSkill(skill.id)}
                      className="ml-2 opacity-70 transition hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                      aria-label={`Remove ${skill.name}`}
                    >
                      {pendingDeleteByKey[`skill:${skill.id}`] ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
                    </button>
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500">No skills added yet.</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Add New Skill</label>
            <Input
              value={newSkillName}
              onChange={(e) => setNewSkillName(e.target.value)}
              placeholder="e.g., Python, React, Machine Learning"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void handleAddSkill();
                }
              }}
            />
            {skillFormError ? <p className="mt-2 text-sm text-red-600">{skillFormError}</p> : null}
          </div>
          <div className="mt-2 flex flex-wrap justify-end gap-3 pt-1">
            <Button variant="outline" onClick={closeModal}>Close</Button>
            <Button onClick={handleAddSkill} disabled={!newSkillName.trim() || busyAction === 'save-skill'} className="rounded-full gradient-primary text-white shadow-md hover:shadow-lg transition-all border-none font-bold disabled:opacity-70">
              {busyAction === 'save-skill' ? 'Adding...' : 'Add Skill'}
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
              onClick={handleAddExperience}
              disabled={!newExperience.roleTitle?.trim() || !newExperience.organization?.trim() || !newExperience.startDate || busyAction === 'save-experience'}
              className="rounded-full gradient-primary text-white shadow-md hover:shadow-lg transition-all border-none font-bold"
            >
              {busyAction === 'save-experience' ? 'Saving...' : `${editingItem ? 'Update' : 'Add'} Experience`}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Project Modal */}
      <Modal isOpen={activeModal === 'project'} onClose={closeModal} title={editingItem ? 'Edit Project' : 'Add Project'} className="w-[min(40rem,calc(100vw-2rem))]" style={{ width: 'min(40rem, calc(100vw - 2rem))' }}>
        <div className="space-y-4 max-h-[70vh] overflow-y-auto max-w-[560px] w-full">
          <div>
            {projectExistingImages.length > 0 && (
              <div className="mb-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
                {projectExistingImages.map((url, index) => (
                  <div key={`${url}-${index}`} className="relative aspect-video rounded-lg overflow-hidden border">
                    <img src={url} alt={`Existing ${index + 1}`} className="h-full w-full object-cover" />
                    <Button
                      type="button"
                      variant="destructive"
                      size="icon"
                      className="absolute top-1 right-1 h-7 w-7 rounded-full"
                      onClick={() =>
                        setProjectExistingImages((current) => current.filter((_, i) => i !== index))
                      }
                      aria-label={`Remove existing image ${index + 1}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
            <MultiImageUpload
              files={projectImageFiles}
              onFilesChange={setProjectImageFiles}
              label="Project images"
              maxFiles={Math.max(0, 10 - projectExistingImages.length)}
            />
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Company</label>
              <Input
                value={newProject.company || ''}
                onChange={(e) => setNewProject({ ...newProject, company: e.target.value })}
                placeholder="Company"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
              <Input
                value={newProject.location || ''}
                onChange={(e) => setNewProject({ ...newProject, location: e.target.value })}
                placeholder="Location"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
              <Input
                type="date"
                value={newProject.deadline ? newProject.deadline.slice(0, 10) : ''}
                onChange={(e) => setNewProject({ ...newProject, deadline: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">External Link</label>
              <Input
                value={newProject.link || ''}
                onChange={(e) => setNewProject({ ...newProject, link: e.target.value })}
                placeholder="External link"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Stipend</label>
              <Input
                value={newProject.stipend || ''}
                onChange={(e) => setNewProject({ ...newProject, stipend: e.target.value })}
                placeholder="Stipend"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Duration</label>
              <Input
                value={newProject.duration || ''}
                onChange={(e) => setNewProject({ ...newProject, duration: e.target.value })}
                placeholder="Duration"
              />
            </div>
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
              <Button type="button" onClick={handleAddProjectTag} className="rounded-full gradient-primary text-white shadow-sm hover:shadow-md transition-all border-none font-bold px-4">Add</Button>
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
              disabled={!newProject.title?.trim() || !newProject.description?.trim() || busyAction === 'save-project'}
              className="rounded-full gradient-primary text-white shadow-md hover:shadow-lg transition-all border-none font-bold"
            >
              {busyAction === 'save-project' ? 'Saving...' : `${editingItem ? 'Update' : 'Add'} Project`}
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
          {!editingItem ? (
            <label className="inline-flex items-center gap-2 text-sm text-slate-700">
              <Checkbox
                checked={shareCertificationAsPost}
                onCheckedChange={(checked) => setShareCertificationAsPost(checked === true)}
              />
              Share this certificate as a post
            </label>
          ) : null}
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={closeModal}>Cancel</Button>
            <Button
              onClick={handleAddCertification}
              disabled={!newCertification.name?.trim() || busyAction === 'save-certification'}
              className="rounded-full gradient-primary text-white shadow-md hover:shadow-lg transition-all border-none font-bold"
            >
              {busyAction === 'save-certification' ? 'Saving...' : `${editingItem ? 'Update' : 'Add'} Certification`}
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
              onClick={handleAddSociety}
              disabled={!newSociety.societyName?.trim() || !newSociety.role?.trim() || busyAction === 'save-society'}
              className="rounded-full gradient-primary text-white shadow-md hover:shadow-lg transition-all border-none font-bold"
            >
              {busyAction === 'save-society' ? 'Saving...' : `${editingItem ? 'Update' : 'Add'} Society`}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={activeModal === 'education'}
        onClose={closeModal}
        title="Update Education"
        className="w-[min(48rem,calc(100vw-2rem))]"
        style={{ width: 'min(48rem, calc(100vw - 2rem))' }}
      >
        <div className="space-y-5 max-w-[760px] w-full">
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Current Campus Profile</p>
            <p className="mt-1 text-sm font-medium text-slate-900">{hasKnownBranch ? profileBranch : 'Branch not added'}</p>
            <p className="text-sm text-slate-700">{hasKnownYear ? `Year ${student.year}` : 'Year not added'}</p>
          </div>
          <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
            <div className="mb-3">
              <p className="text-sm font-semibold text-slate-900">Academic Records</p>
            </div>
            {educationRecords.length > 0 ? (
              <div className="space-y-3">
                {orderedEducationRecords.map((record) => (
                  <div key={record.id} className="rounded-xl border border-slate-200 bg-white p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900">{record.level}</p>
                        <p className="text-sm text-slate-600">{record.institution || 'Institution not added'}</p>
                        <p className="text-xs text-slate-500">
                          {record.level === '10th' || record.level === '12th'
                            ? `Year ${record.startYear || 'Not added'}`
                            : `${record.isPursuing ? 'Currently pursuing' : 'Completed'}${record.startYear ? ` • ${record.startYear}` : ''}${record.endYear ? ` - ${record.endYear}` : ''}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <button type="button" onClick={() => startEditEducationRecord(record)} className="rounded-full p-2 text-slate-400 hover:bg-blue-50 hover:text-blue-600" aria-label="Edit education entry">
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button type="button" onClick={() => removeEducationRecord(record.id)} className="rounded-full p-2 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label="Delete education entry">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500">Add records for 10th, 12th, Bachelor's, Master's, or other education.</p>
            )}
            {educationForm ? (
              <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3">
                <div className="mb-3 grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-700">Level</label>
                    <select className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={educationForm.level} onChange={(event) => updateEducationRecordForm({ level: event.target.value as EducationLevel })}>
                      <option value="10th">10th</option>
                      <option value="12th">12th</option>
                      <option value="Bachelor's">Bachelor's</option>
                      <option value="Master's">Master's</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-700">Institute</label>
                    <Input value={educationForm.institution} onChange={(event) => updateEducationRecordForm({ institution: event.target.value })} placeholder="School / College / University" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-700">Branch / Stream</label>
                    <Input value={educationForm.branch} onChange={(event) => updateEducationRecordForm({ branch: event.target.value })} placeholder="e.g., Science, CSE" />
                  </div>
                  {educationForm.level === '10th' || educationForm.level === '12th' ? (
                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-700">Year</label>
                      <Input type="number" value={educationForm.startYear} onChange={(event) => updateEducationRecordForm({ startYear: event.target.value, endYear: '' })} placeholder="2020" />
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-700">From</label>
                        <Input type="number" value={educationForm.startYear} onChange={(event) => updateEducationRecordForm({ startYear: event.target.value })} placeholder="2019" />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-700">To</label>
                        <Input type="number" value={educationForm.endYear} onChange={(event) => updateEducationRecordForm({ endYear: event.target.value })} placeholder="2023" disabled={educationForm.isPursuing} />
                      </div>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-700">Result Type</label>
                      <select className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={educationForm.scoreType} onChange={(event) => updateEducationRecordForm({ scoreType: event.target.value as 'percentage' | 'cgpa' })}>
                        <option value="percentage">Percentage</option>
                        <option value="cgpa">CGPA</option>
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-700">Score</label>
                      <Input value={educationForm.score} onChange={(event) => updateEducationRecordForm({ score: event.target.value })} placeholder={educationForm.scoreType === 'cgpa' ? 'e.g., 8.6' : 'e.g., 86%'} />
                    </div>
                  </div>
                </div>
                {educationForm.level !== '10th' && educationForm.level !== '12th' ? (
                  <div className="mb-3 flex items-center justify-between">
                    <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                      <Checkbox checked={educationForm.isPursuing} onCheckedChange={(checked) => updateEducationRecordForm({ isPursuing: Boolean(checked), endYear: checked ? '' : educationForm.endYear })} />
                      Currently pursuing
                    </label>
                    {(educationForm.level === "Bachelor's" || educationForm.level === "Master's") && educationForm.isPursuing && student.year > 0 ? (
                      <span className="text-xs font-medium text-emerald-700">Auto year: {student.year}</span>
                    ) : null}
                  </div>
                ) : null}
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={cancelEducationForm}>Cancel</Button>
                  <Button type="button" onClick={saveEducationRecordForm} className="rounded-full gradient-primary text-white border-none">Save record</Button>
                </div>
              </div>
            ) : null}
            {!educationForm ? (
              <div className="mt-4">
                <Button type="button" variant="outline" className="rounded-full" onClick={addEducationRecord}>
                  <Plus className="mr-1 h-4 w-4" />
                  Add record
                </Button>
              </div>
            ) : null}
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={closeModal}>Cancel</Button>
            <Button disabled={busyAction === 'save-education'} onClick={handleSaveEducation} className="rounded-full gradient-primary text-white shadow-md hover:shadow-lg transition-all border-none font-bold disabled:opacity-70">
              {busyAction === 'save-education' ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={Boolean(certPreview)}
        onClose={() => setCertPreview(null)}
        title={certPreview?.title || 'Certificate'}
        className="w-[min(60rem,calc(100vw-2rem))]"
        style={{ width: 'min(60rem, calc(100vw - 2rem))' }}
      >
        {certPreview ? (
          <div className="w-full space-y-4">
            <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm text-slate-600">{certPreview.issuer || 'Issuer not added'}</p>
              {certPreview.issueDate ? (
                <p className="text-sm text-slate-600">Issued: {format(certPreview.issueDate, 'MMM d, yyyy')}</p>
              ) : null}
              {certPreview.description ? (
                <p className="text-sm leading-6 text-slate-700">{certPreview.description}</p>
              ) : null}
              {certPreview.certificateUrl ? (
                <a
                  href={certPreview.certificateUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-100"
                >
                  View verification link
                </a>
              ) : null}
            </div>
            <ImageWithFallback src={certPreview.url} alt={certPreview.title} className="max-h-[80vh] w-full rounded-xl object-contain" />
          </div>
        ) : null}
      </Modal>
    </PageLayout>
  );
}
