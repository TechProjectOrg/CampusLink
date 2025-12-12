import { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { AuthPage } from './components/AuthPage';
import { FeedPage } from './components/FeedPage';
import { ProfilePage } from './components/ProfilePage';
import { SearchPage } from './components/SearchPage';
import { NetworkPage } from './components/NetworkPage';
import { ChatPage } from './components/ChatPage';
import { ClubsPage } from './components/ClubsPage';
import { NotificationsPage } from './components/NotificationsPage';
import { SettingsPage } from './components/SettingsPage';
import { FloatingChat } from './components/FloatingChat';
import { Toaster } from './components/ui/sonner';
import { mockStudents, mockOpportunities, mockClubs, mockConversations, mockNotifications, getCurrentUser } from './lib/mockData';
import { Student, Opportunity, Club, Notification } from './types';

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [activeTab, setActiveTab] = useState('feed');
  const [students, setStudents] = useState<Student[]>(mockStudents);
  const [opportunities, setOpportunities] = useState<Opportunity[]>(mockOpportunities);
  const [clubs, setClubs] = useState<Club[]>(mockClubs);
  const [notifications, setNotifications] = useState<Notification[]>(mockNotifications);
  const [conversations, setConversations] = useState(mockConversations);
  const [viewingProfileId, setViewingProfileId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  useEffect(() => {
    const setTabFromPath = () => {
        const pathParts = window.location.pathname.split('/').filter(p => p);
        const mainPath = pathParts[0] || 'feed';
        setActiveTab(mainPath);

        if (mainPath === 'profile' && pathParts[1]) {
            setViewingProfileId(pathParts[1]);
        } else {
            setViewingProfileId(null);
        }
    };

    setTabFromPath(); // Initial load

    const handlePopState = () => {
        setTabFromPath();
    };

    window.addEventListener('popstate', handlePopState);

    return () => {
        window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  const navigate = (tab: string, profileId?: string) => {
    let path = `/${tab}`;
    const state: { tab: string; profileId?: string } = { tab };
    if (tab === 'profile' && profileId) {
        path += `/${profileId}`;
        state.profileId = profileId;
    }
    window.history.pushState(state, '', path);
    setActiveTab(tab); // Set active tab to trigger re-render
  };
  
  const currentUserId = 'current';

  // Opportunity handlers
  const handleLike = (opportunityId: string) => {
    setOpportunities(opportunities.map(opp => {
      if (opp.id === opportunityId) {
        const isLiked = opp.likes.includes(currentUserId);
        return {
          ...opp,
          likes: isLiked 
            ? opp.likes.filter(id => id !== currentUserId)
            : [...opp.likes, currentUserId]
        };
      }
      return opp;
    }));
  };

  const handleSave = (opportunityId: string) => {
    setOpportunities(opportunities.map(opp => {
      if (opp.id === opportunityId) {
        const isSaved = opp.saved.includes(currentUserId);
        return {
          ...opp,
          saved: isSaved 
            ? opp.saved.filter(id => id !== currentUserId)
            : [...opp.saved, currentUserId]
        };
      }
      return opp;
    }));
  };

  const handleComment = (opportunityId: string, commentText: string) => {
    setOpportunities(opportunities.map(opp => {
      if (opp.id === opportunityId) {
        const currentUser = getCurrentUser();
        const newComment = {
          id: Date.now().toString(),
          authorId: currentUserId,
          authorName: currentUser.name,
          authorAvatar: currentUser.avatar,
          content: commentText,
          timestamp: new Date().toISOString()
        };
        return {
          ...opp,
          comments: [...opp.comments, newComment]
        };
      }
      return opp;
    }));
  };

  // Network handlers
  const handleConnect = (studentId: string) => {
    setStudents(students.map(student => {
      if (student.id === studentId) {
        return {
          ...student,
          pendingRequests: [...student.pendingRequests, currentUserId]
        };
      }
      return student;
    }));
    alert('Connection request sent!');
  };

  const handleAcceptRequest = (studentId: string) => {
    setStudents(students.map(student => {
      if (student.id === currentUserId) {
        return {
          ...student,
          connections: [...student.connections, studentId],
          pendingRequests: student.pendingRequests.filter(id => id !== studentId)
        };
      }
      if (student.id === studentId) {
        return {
          ...student,
          connections: [...student.connections, currentUserId]
        };
      }
      return student;
    }));
  };

  const handleRejectRequest = (studentId: string) => {
    setStudents(students.map(student => {
      if (student.id === currentUserId) {
        return {
          ...student,
          pendingRequests: student.pendingRequests.filter(id => id !== studentId)
        };
      }
      return student;
    }));
  };

  const handleMessage = (studentId: string) => {
    navigate('chat');
  };

  const handleChatClick = (conversationId: string) => {
    setConversations(prevConversations => {
      const conversationIndex = prevConversations.findIndex(
        (conv) => conv.id === conversationId
      );

      if (conversationIndex === -1) {
        return prevConversations;
      }

      const updatedConversations = [...prevConversations];
      const [clickedConversation] = updatedConversations.splice(conversationIndex, 1);
      updatedConversations.unshift(clickedConversation);
      return updatedConversations;
    });
  };

  const handleViewProfile = (studentId: string) => {
    setViewingProfileId(studentId);
    navigate('profile', studentId);
  };

  // Club handlers
  const handleJoinClub = (clubId: string) => {
    setClubs(clubs.map(club => {
      if (club.id === clubId) {
        return {
          ...club,
          members: [...club.members, currentUserId]
        };
      }
      return club;
    }));
  };

  const handleLeaveClub = (clubId: string) => {
    setClubs(clubs.map(club => {
      if (club.id === clubId) {
        return {
          ...club,
          members: club.members.filter(id => id !== currentUserId)
        };
      }
      return club;
    }));
  };

  // Profile handlers
  const handleEditProfile = (updates: Partial<Student>) => {
    setStudents(students.map(student => {
      if (student.id === currentUserId) {
        return { ...student, ...updates };
      }
      return student;
    }));
  };

  // Notification handlers
  const handleMarkAsRead = (notificationId: string) => {
    setNotifications(notifications.map(notif => 
      notif.id === notificationId ? { ...notif, read: true } : notif
    ));
  };

  const handleMarkAllAsRead = () => {
    setNotifications(notifications.map(notif => ({ ...notif, read: true })));
  };

  const handleNotificationClick = (notification: Notification) => {
    // Handle different notification types
    switch (notification.type) {
      case 'connection':
        navigate('network');
        break;
      case 'message':
        navigate('chat');
        break;
      case 'opportunity':
        navigate('feed');
        break;
      case 'club':
        navigate('clubs');
        break;
    }
  };

  // Auth handler
  const handleLogin = () => {
    setIsAuthenticated(true);
    navigate('feed');
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    navigate('feed');
    setViewingProfileId(null);
  };

  // Create opportunity handler
  const handleCreateOpportunity = (opportunity: Opportunity) => {
    setOpportunities([opportunity, ...opportunities]);
  };

  // Create club handler
  const handleCreateClub = (club: Club) => {
    setClubs([club, ...clubs]);
  };

  // Settings handler
  const handleUpdateSettings = (settings: any) => {
    // Handle settings update
    console.log('Settings updated:', settings);
  };

  // Calculate unread messages and notifications
  const unreadCount = conversations.reduce((sum, conv) => sum + conv.unread, 0);
  const unreadNotifications = notifications.filter(n => !n.read).length;

  if (!isAuthenticated) {
    return <AuthPage onLogin={handleLogin} />;
  }

  const currentUser = getCurrentUser();
  const displayedStudent = viewingProfileId 
    ? students.find(s => s.id === viewingProfileId) || currentUser
    : currentUser;

  // Reset viewing profile when switching tabs
  const handleTabChange = (tab: string) => {
    if (tab !== 'profile') {
      setViewingProfileId(null);
    }
    if (tab !== 'search') {
      setSearchQuery('');
    }
    navigate(tab);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar 
        activeTab={activeTab} 
        onTabChange={handleTabChange}
        unreadCount={unreadCount}
        unreadNotifications={unreadNotifications}
        onSearch={setSearchQuery}
      />
      
      {activeTab === 'feed' && (
        <FeedPage
          opportunities={opportunities}
          currentUserId={currentUserId}
          currentUser={currentUser}
          students={students}
          onLike={handleLike}
          onSave={handleSave}
          onComment={handleComment}
          onCreateOpportunity={handleCreateOpportunity}
          onViewProfile={() => handleViewProfile(currentUserId)}
          onConnect={handleConnect}
          onViewStudentProfile={handleViewProfile}
        />
      )}

      {activeTab === 'search' && (
        <SearchPage
          students={students}
          currentUserId={currentUserId}
          onConnect={handleConnect}
          onViewProfile={handleViewProfile}
          initialSearchQuery={searchQuery}
        />
      )}

      {activeTab === 'network' && (
        <NetworkPage
          students={students}
          currentUserId={currentUserId}
          onAcceptRequest={handleAcceptRequest}
          onRejectRequest={handleRejectRequest}
          onMessage={handleMessage}
          onViewProfile={handleViewProfile}
          onConnect={handleConnect}
        />
      )}

      {activeTab === 'chat' && (
        <ChatPage
          conversations={conversations}
          students={students}
          currentUserId={currentUserId}
          onViewProfile={handleViewProfile}
          onChatClick={handleChatClick}
        />
      )}

      {activeTab === 'clubs' && (
        <ClubsPage
          clubs={clubs}
          students={students}
          currentUserId={currentUserId}
          onJoinClub={handleJoinClub}
          onLeaveClub={handleLeaveClub}
          onCreateClub={handleCreateClub}
          onViewProfile={handleViewProfile}
        />
      )}

      {activeTab === 'profile' && (
        <ProfilePage
          student={displayedStudent}
          isOwnProfile={displayedStudent.id === currentUserId}
          onEdit={handleEditProfile}
          opportunities={opportunities}
          onLike={handleLike}
          onSave={handleSave}
          onComment={handleComment}
        />
      )}

      {activeTab === 'notifications' && (
        <NotificationsPage
          notifications={notifications}
          onMarkAsRead={handleMarkAsRead}
          onMarkAllAsRead={handleMarkAllAsRead}
          onNotificationClick={handleNotificationClick}
        />
      )}

      {activeTab === 'settings' && (
        <SettingsPage
          student={currentUser}
          onEdit={handleEditProfile}
          onUpdateSettings={handleUpdateSettings}
        />
      )}

      {activeTab !== 'chat' && (
        <FloatingChat
          conversations={conversations}
          currentUserId={currentUserId}
          onOpenFullChat={() => handleTabChange('chat')}
          onChatClick={handleChatClick}
        />
      )}
      <Toaster />
    </div>
  );
}