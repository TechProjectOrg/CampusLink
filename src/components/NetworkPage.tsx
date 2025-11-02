import { Users, UserCheck, UserPlus, MessageCircle } from 'lucide-react';
import { Student } from '../types';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { Card, CardContent } from './ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';

interface NetworkPageProps {
  students: Student[];
  currentUserId: string;
  onAcceptRequest: (studentId: string) => void;
  onRejectRequest: (studentId: string) => void;
  onMessage: (studentId: string) => void;
  onViewProfile: (studentId: string) => void;
}

export function NetworkPage({ 
  students, 
  currentUserId, 
  onAcceptRequest, 
  onRejectRequest,
  onMessage,
  onViewProfile
}: NetworkPageProps) {
  const currentUser = students.find(s => s.id === currentUserId);
  
  const connections = students.filter(s => currentUser?.connections.includes(s.id));
  const pendingRequests = students.filter(s => currentUser?.pendingRequests.includes(s.id));

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50/30 to-purple-50/30 animate-fade-in">
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="animate-slide-in-down">
          <h1 className="text-gray-900 bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
            My Network
          </h1>
          <p className="text-gray-600">Manage your connections and requests</p>
        </div>

        <Tabs defaultValue="connections" className="space-y-6 animate-slide-in-up">
          <TabsList className="bg-white/80 backdrop-blur-lg p-1 rounded-2xl border border-primary/10 shadow-lg">
            <TabsTrigger 
              value="connections" 
              className="flex items-center gap-2 rounded-xl data-[state=active]:gradient-primary data-[state=active]:text-white transition-all duration-300"
            >
              <Users className="w-4 h-4" />
              Connections
              <Badge className="bg-secondary text-white ml-1 transition-all duration-300 hover:scale-110">
                {connections.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger 
              value="requests" 
              className="flex items-center gap-2 rounded-xl data-[state=active]:gradient-primary data-[state=active]:text-white transition-all duration-300"
            >
              <UserPlus className="w-4 h-4" />
              Requests
              {pendingRequests.length > 0 && (
                <Badge className="bg-destructive text-white ml-1 animate-pulse transition-all duration-300">
                  {pendingRequests.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {/* Connections Tab */}
          <TabsContent value="connections" className="space-y-4 animate-fade-in">
            {connections.length === 0 ? (
              <Card className="border-primary/10 rounded-2xl shadow-lg">
                <CardContent className="p-12 text-center">
                  <div className="w-16 h-16 gradient-primary rounded-2xl mx-auto mb-4 flex items-center justify-center">
                    <Users className="w-8 h-8 text-white" />
                  </div>
                  <p className="text-gray-500">No connections yet. Start networking!</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {connections.map((student, index) => (
                  <Card 
                    key={student.id} 
                    className="hover:shadow-2xl transition-all duration-300 hover:-translate-y-1 border-primary/10 rounded-2xl animate-slide-in-up"
                    style={{ animationDelay: `${index * 50}ms` }}
                  >
                    <CardContent className="p-6 space-y-4">
                      {/* Header */}
                      <div className="flex items-start gap-3">
                        <Avatar className="w-16 h-16 ring-2 ring-primary/20 transition-all duration-300 hover:ring-primary/40">
                          <AvatarImage src={student.avatar} />
                          <AvatarFallback>{student.name[0]}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <h3 className="text-gray-900 truncate">{student.name}</h3>
                          <p className="text-sm text-gray-600">{student.branch}</p>
                          <p className="text-sm text-secondary">Year {student.year}</p>
                        </div>
                        <Badge className="bg-accent/10 text-accent border border-accent/20 transition-all duration-300 hover:scale-110">
                          <UserCheck className="w-3 h-3 mr-1" />
                          Connected
                        </Badge>
                      </div>

                      {/* Bio */}
                      <p className="text-sm text-gray-600 line-clamp-2">{student.bio}</p>

                      {/* Skills */}
                      <div className="flex flex-wrap gap-1">
                        {student.skills.slice(0, 4).map(skill => (
                          <Badge key={skill} variant="outline" className="text-xs border-primary/20 text-primary">
                            {skill}
                          </Badge>
                        ))}
                        {student.skills.length > 4 && (
                          <Badge variant="outline" className="text-xs border-primary/20 text-primary">
                            +{student.skills.length - 4}
                          </Badge>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex gap-2 pt-2">
                        <Button
                          onClick={() => onViewProfile(student.id)}
                          variant="outline"
                          className="flex-1 border-primary/20 hover:border-primary rounded-xl transition-all duration-300 hover:scale-105"
                          size="sm"
                        >
                          View Profile
                        </Button>
                        <Button
                          onClick={() => onMessage(student.id)}
                          className="flex-1 gradient-secondary shadow-lg transition-all duration-300 hover:scale-105 hover:shadow-xl rounded-xl"
                          size="sm"
                        >
                          <MessageCircle className="w-4 h-4 mr-2" />
                          Message
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Requests Tab */}
          <TabsContent value="requests" className="space-y-4 animate-fade-in">
            {pendingRequests.length === 0 ? (
              <Card className="border-primary/10 rounded-2xl shadow-lg">
                <CardContent className="p-12 text-center">
                  <div className="w-16 h-16 gradient-primary rounded-2xl mx-auto mb-4 flex items-center justify-center">
                    <UserPlus className="w-8 h-8 text-white" />
                  </div>
                  <p className="text-gray-500">No pending connection requests.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {pendingRequests.map((student, index) => (
                  <Card 
                    key={student.id} 
                    className="border-primary/10 rounded-2xl shadow-lg hover-lift animate-slide-in-up"
                    style={{ animationDelay: `${index * 50}ms` }}
                  >
                    <CardContent className="p-6">
                      <div className="flex flex-col md:flex-row gap-4 items-start md:items-center">
                        {/* Student Info */}
                        <div className="flex items-start gap-3 flex-1">
                          <Avatar className="w-16 h-16 ring-2 ring-primary/20">
                            <AvatarImage src={student.avatar} />
                            <AvatarFallback>{student.name[0]}</AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <h3 className="text-gray-900">{student.name}</h3>
                            <p className="text-sm text-gray-600">{student.branch} • Year {student.year}</p>
                            <p className="text-sm text-gray-600 mt-1 line-clamp-2">{student.bio}</p>
                            <div className="flex flex-wrap gap-1 mt-2">
                              {student.skills.slice(0, 3).map(skill => (
                                <Badge key={skill} variant="outline" className="text-xs border-primary/20 text-primary">
                                  {skill}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex gap-2 w-full md:w-auto">
                          <Button
                            onClick={() => onAcceptRequest(student.id)}
                            className="flex-1 md:flex-initial gradient-success shadow-lg transition-all duration-300 hover:scale-105 hover:shadow-xl rounded-xl"
                          >
                            <UserCheck className="w-4 h-4 mr-2" />
                            Accept
                          </Button>
                          <Button
                            onClick={() => onRejectRequest(student.id)}
                            variant="outline"
                            className="flex-1 md:flex-initial border-destructive/20 text-destructive hover:bg-destructive/10 rounded-xl transition-all duration-300 hover:scale-105"
                          >
                            Decline
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
