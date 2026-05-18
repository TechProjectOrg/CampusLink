CREATE TABLE project_media (
    project_media_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES user_projects(project_id) ON DELETE CASCADE,
    media_url TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_project_media_project_id ON project_media(project_id);

INSERT INTO project_media (project_id, media_url, sort_order)
SELECT project_id, image_url, 0
FROM user_projects
WHERE image_url IS NOT NULL;
