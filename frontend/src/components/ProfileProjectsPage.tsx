import { useEffect, useState } from 'react';
import { ArrowLeft, ExternalLink, Github, Globe } from 'lucide-react';
import { Student } from '../types';
import { useAuth } from '../context/AuthContext';
import { apiFetchUserProjects, type UserProject } from '../lib/projectsApi';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { ImageWithFallback } from './figma/ImageWithFallback';
import { LoadingIndicator } from './ui/LoadingIndicator';

interface ProfileProjectsPageProps {
  student: Student;
  onBack: () => void;
}

export function ProfileProjectsPage({ student, onBack }: ProfileProjectsPageProps) {
  const auth = useAuth();
  const [projects, setProjects] = useState<UserProject[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [visibleCount, setVisibleCount] = useState(8);

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

  return (
    <main className="min-h-screen bg-slate-50 pb-24 md:pb-8">
      <div className="mx-auto max-w-4xl space-y-6 px-4 py-6 sm:px-6">
        <header className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2 mb-4 rounded-full">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <Avatar className="h-16 w-16 ring-4 ring-slate-100">
                <AvatarImage src={student.avatar} alt={student.name} />
                <AvatarFallback>{student.name[0]}</AvatarFallback>
              </Avatar>
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.18em] text-slate-400">Projects</p>
                <h1 className="text-2xl font-semibold tracking-tight text-slate-950">{student.name}</h1>
                <p className="mt-1 text-sm text-slate-500">{student.headline || student.branch}</p>
              </div>
            </div>
          </div>
        </header>

        {isLoading ? (
          <div className="rounded-3xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
            <LoadingIndicator label="Loading projects..." />
          </div>
        ) : visibleProjects.length > 0 ? (
          <div className="space-y-5">
            {visibleProjects.map((project) => (
              <article key={project.id} className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-slate-200 transition hover:-translate-y-0.5 hover:shadow-lg">
                {project.imageUrl ? (
                  <ImageWithFallback src={project.imageUrl} alt={project.title} className="h-56 w-full object-cover" />
                ) : (
                  <div className="flex h-56 items-center justify-center bg-gradient-to-br from-indigo-50 via-sky-50 to-emerald-50">
                    <ExternalLink className="h-12 w-12 text-indigo-300" />
                  </div>
                )}
                <div className="space-y-4 p-5 sm:p-6">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <h2 className="text-xl font-semibold tracking-tight text-slate-950">{project.title}</h2>
                      <p className="mt-2 max-w-3xl leading-7 text-slate-600">{project.description}</p>
                    </div>
                    {project.link ? (
                      <a href={project.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700">
                        <Globe className="h-4 w-4" />
                        Open
                      </a>
                    ) : null}
                  </div>
                  {project.tags.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {project.tags.map((tag) => (
                        <Badge key={tag} variant="outline" className="rounded-full border-slate-200 bg-slate-50 text-slate-600">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  ) : null}
                  {project.link ? (
                    <div className="flex items-center gap-2 border-t border-slate-100 pt-4 text-sm text-slate-500">
                      <Github className="h-4 w-4" />
                      <span className="truncate">{project.link}</span>
                    </div>
                  ) : null}
                </div>
              </article>
            ))}
            {hasMore ? (
              <Button variant="outline" className="w-full rounded-2xl bg-white" onClick={() => setVisibleCount((count) => count + 8)}>
                Load more projects
              </Button>
            ) : null}
          </div>
        ) : (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center shadow-sm">
            <ExternalLink className="mx-auto h-10 w-10 text-indigo-300" />
            <p className="mt-4 font-medium text-slate-700">{student.name} has not added projects yet.</p>
          </div>
        )}
      </div>
    </main>
  );
}
