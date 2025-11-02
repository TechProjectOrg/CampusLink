import { useState } from 'react';
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
  X
} from 'lucide-react';
import { Student } from '../types';
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
}

export function ProfilePage({ student, isOwnProfile, onEdit }: ProfilePageProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedStudent, setEditedStudent] = useState(student);

  const handleSave = () => {
    if (onEdit) {
      onEdit(editedStudent);
    }
    setIsEditing(false);
  };

  const addSkill = (skill: string) => {
    if (skill && !editedStudent.skills.includes(skill)) {
      setEditedStudent({
        ...editedStudent,
        skills: [...editedStudent.skills, skill]
      });
    }
  };

  const removeSkill = (skill: string) => {
    setEditedStudent({
      ...editedStudent,
      skills: editedStudent.skills.filter(s => s !== skill)
    });
  };

  return (
    <div className="min-h-screen bg-gray-50">
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
            <div className="flex flex-wrap gap-2">
              {(isEditing ? editedStudent : student).skills.map((skill) => (
                <Badge key={skill} className="bg-blue-100 text-blue-800">
                  {skill}
                  {isEditing && (
                    <button
                      onClick={() => removeSkill(skill)}
                      className="ml-2 hover:text-blue-900"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </Badge>
              ))}
              {isEditing && (
                <button
                  onClick={() => {
                    const skill = prompt('Enter skill name:');
                    if (skill) addSkill(skill);
                  }}
                  className="px-3 py-1 rounded-md border-2 border-dashed border-gray-300 text-gray-600 hover:border-gray-400 hover:text-gray-700 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                </button>
              )}
            </div>
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
      </div>
    </div>
  );
}
