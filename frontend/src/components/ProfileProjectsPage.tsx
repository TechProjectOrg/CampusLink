import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, MessageCircle } from 'lucide-react';
import { Opportunity, Student } from '../types';
import { useAuth } from '../context/AuthContext';
import { apiDeleteUserProject, apiFetchUserProjects, apiUpdateUserProject, type UserProject } from '../lib/projectsApi';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { Button } from './ui/button';
import { LoadingIndicator } from './ui/LoadingIndicator';
import { PageLayout } from './PageLayout';
import { OpportunityCard } from './OpportunityCard';

interface ProfileProjectsPageProps {
  student: Student;
  currentUserId: string;
  isOwnProfile: boolean;
  onBack: () => void;
  onOpenPost?: (post: Opportunity) => void;
}

function mapProjectToOpportunity(project: UserProject, student: Student): Opportunity {
  return {
    id: `project-${project.id}`,
    authorId: student.id,
    authorName: student.name,
    authorAvatar: student.avatar,
    type: 'project',
    title: project.title,
    description: project.description,
    date: new Date().toISOString(),
    link: project.demoUrl || project.sourceUrl || project.link || undefined,
    image: project.imageUrl || undefined,
    tags: Array.from(new Set(['project', ...(project.tags ?? [])])),
    likes: [],
    comments: [],
    saved: [],
    likeCount: 0,
    commentCount: 0,
    saveCount: 0,
    isLikedByMe: false,
    isSavedByMe: false,
    canEdit: true,
    canDelete: true,
  };
}

export function ProfileProjectsPage({ student, currentUserId, isOwnProfile, onBack, onOpenPost }: ProfileProjectsPageProps) {
  const auth = useAuth();
  const [projects, setProjects] = useState<UserProject[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [visibleCount, setVisibleCount] = useState(8);
  const [projectLikesById, setProjectLikesById] = useState<Record<string, { liked: boolean; count: number }>>({});
  const authUserId = auth.currentUser?.id ?? auth.session?.userId;

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    apiFetchUserProjects(student.id, auth.session?.token)
      .then((list) => {
        if (!cancelled) setProjects(list);
      })
      .catch(() => {
        if (!cancelled) setProjects([]);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [student.id, auth.session?.token]);

  const visibleProjects = projects.slice(0, visibleCount);
  const hasMore = visibleCount < projects.length;
  const visibleCards = useMemo(
    () =>
      visibleProjects.map((project) => {
        const base = mapProjectToOpportunity(project, student);
        const state = projectLikesById[project.id];
        return state
          ? {
              ...base,
              isLikedByMe: state.liked,
              likeCount: state.count,
            }
          : base;
      }),
    [visibleProjects, student, projectLikesById],
  );

  const handleProjectLike = (projectOpportunityId: string) => {
    const projectId = projectOpportunityId.startsWith('project-') ? projectOpportunityId.slice('project-'.length) : projectOpportunityId;
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

  const handleEditProject = async (projectOpportunityId: string, updates: Partial<Opportunity>) => {
    if (!isOwnProfile || !authUserId) return;
    const projectId = projectOpportunityId.startsWith('project-')
      ? projectOpportunityId.slice('project-'.length)
      : projectOpportunityId;
    const currentProject = projects.find((project) => project.id === projectId);
    if (!currentProject) return;

    const tags = (updates.tags ?? currentProject.tags ?? [])
      .map((tag) => tag.trim())
      .filter(Boolean);

    try {
      const updated = await apiUpdateUserProject(
        authUserId,
        projectId,
        {
          title: updates.title?.trim() || currentProject.title,
          description: updates.description?.trim() || currentProject.description,
          sourceUrl: updates.link?.trim() || currentProject.sourceUrl || undefined,
          demoUrl: updates.link?.trim() || currentProject.demoUrl || undefined,
          tags,
        },
        auth.session?.token,
      );
      setProjects((current) =>
        current.map((project) => (project.id === projectId ? updated : project)),
      );
    } catch {
      // Keep page stable; API errors are surfaced via unchanged UI state.
    }
  };

  const handleDeleteProject = async (projectOpportunityId: string) => {
    if (!isOwnProfile || !authUserId) return;
    const projectId = projectOpportunityId.startsWith('project-')
      ? projectOpportunityId.slice('project-'.length)
      : projectOpportunityId;
    try {
      await apiDeleteUserProject(authUserId, projectId, auth.session?.token);
      setProjects((current) => current.filter((project) => project.id !== projectId));
    } catch {
      // Keep page stable; API errors are surfaced via unchanged UI state.
    }
  };

  return (
    <PageLayout hideScrollbar={true} maxWidth="7xl" className="bg-slate-50 pb-24 md:pb-8" contentClassName="py-4 sm:py-5 lg:py-6">
      <div className="mx-auto w-full space-y-6" style={{ maxWidth: '1000px' }}>
        <header className="overflow-visible rounded-3xl border border-slate-200/80 bg-white px-6 pb-6 pt-4 shadow-sm sm:px-7 sm:pb-7 sm:pt-5">
          <Button variant="ghost" size="sm" onClick={onBack} className="mb-5 rounded-full">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-4 sm:gap-5">
            <div className="flex items-center gap-4 pl-1 sm:gap-5">
              <Avatar className="aspect-square shrink-0 overflow-hidden rounded-full border border-slate-200 ring-4 ring-white shadow-sm" style={{ width: 80, height: 80 }}>
                <AvatarImage src={student.avatar} alt={student.name} className="h-full w-full object-cover" />
                <AvatarFallback>{student.name[0]}</AvatarFallback>
              </Avatar>
              <div className="space-y-1">
                <p className="text-sm font-medium uppercase tracking-[0.18em] text-slate-400">Projects</p>
                <h1 className="text-2xl font-semibold tracking-tight text-slate-950">{student.name}</h1>
                <p className="mt-1 text-sm text-slate-500">{student.bio || student.branch}</p>
              </div>
            </div>
          </div>
        </header>

        {isLoading ? (
          <div className="rounded-3xl border border-slate-200/80 bg-white p-8 shadow-sm">
            <LoadingIndicator label="Loading projects..." />
          </div>
        ) : visibleCards.length > 0 ? (
          <div className="space-y-5">
            {visibleCards.map((projectCard) => (
              <OpportunityCard
                key={projectCard.id}
                opportunity={projectCard}
                currentUserId={currentUserId}
                showManagementControls={isOwnProfile}
                onLike={handleProjectLike}
                onSave={() => undefined}
                onComment={() => undefined}
                onReply={() => undefined}
                onLikeComment={() => undefined}
                onDeleteComment={() => undefined}
                onEditPost={handleEditProject}
                onDeletePost={handleDeleteProject}
                onOpenPost={onOpenPost}
                onViewProfile={() => undefined}
              />
            ))}
            {hasMore ? (
              <Button variant="outline" className="w-full rounded-2xl border-slate-200 bg-white text-slate-800 shadow-sm transition-transform duration-200 hover:scale-[1.02]" onClick={() => setVisibleCount((count) => count + 8)}>
                Load more projects
              </Button>
            ) : null}
          </div>
        ) : (
          <div className="rounded-3xl border border-slate-200/80 bg-white p-10 text-center shadow-sm">
            <MessageCircle className="mx-auto h-10 w-10 text-blue-300" />
            <p className="mt-4 font-medium text-slate-700">Showcase your projects and work.</p>
          </div>
        )}
      </div>
    </PageLayout>
  );
}
