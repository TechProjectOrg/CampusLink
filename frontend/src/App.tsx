import { useEffect, useMemo, useRef, useState } from 'react';
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
import { LoadingState } from './components/LoadingState';
import { Toaster } from './components/ui/sonner';
import { toast } from 'sonner';
import {
  mockStudents,
  mockOpportunities,
  mockClubs,
  mockConversations,
  mockNotifications,
  getCurrentUser,
} from './lib/mockData';
import { mockFollowGraph, type FollowGraph } from './lib/mockFollows';
import { Student, Opportunity, Club, Notification } from './types';
import { ProfileCard } from './components/ProfileCard';
import { SuggestionsCard } from './components/SuggestionsCard';
import { useAuth } from './context/AuthContext';

export default function App() {
  const auth = useAuth();

  const [activeTab, setActiveTab] = useState('feed');
  const [students, setStudents] = useState<Student[]>(mockStudents);
  const [opportunities, setOpportunities] = useState<Opportunity[]>(mockOpportunities);
  const [clubs, setClubs] = useState<Club[]>(mockClubs);
  const [notifications, setNotifications] = useState<Notification[]>(mockNotifications);
  const [conversations, setConversations] = useState(mockConversations);
  const [followGraph, setFollowGraph] = useState<FollowGraph>(mockFollowGraph);
  const [viewingProfileId, setViewingProfileId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const prevAuthenticatedRef = useRef<boolean>(auth.isAuthenticated);

  // Always land on homescreen after a successful login/signup.
  useEffect(() => {
    const wasAuthenticated = prevAuthenticatedRef.current;
    const isAuthenticated = auth.isAuthenticated;

    // Transition: logged in
    if (!wasAuthenticated && isAuthenticated) {
      setViewingProfileId(null);
      setSearchQuery('');
      setActiveTab('feed');
      window.history.pushState({ tab: 'feed' }, '', '/feed');
    }

    // Transition: logged out (optional, but avoids restoring old tab on next login)
    if (wasAuthenticated && !isAuthenticated) {
      setViewingProfileId(null);
      setSearchQuery('');
      setActiveTab('feed');
      window.history.pushState({ tab: 'feed' }, '', '/feed');
    }

    prevAuthenticatedRef.current = isAuthenticated;
  }, [auth.isAuthenticated]);
  
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
  
  const currentUser = useMemo(() => {
    const mockMe = getCurrentUser();
    if (!auth.currentUser) return mockMe;

    // Preserve mock-only fields (skills, interests, etc.) but overwrite identity fields from backend.
    return {
      ...mockMe,
      id: auth.currentUser.id,
      name: auth.currentUser.name,
      username: auth.currentUser.username,
      email: auth.currentUser.email,
      branch: auth.currentUser.branch,
      year: auth.currentUser.year,
      avatar: auth.currentUser.avatar,
      bio: auth.currentUser.bio,
      accountType: auth.currentUser.accountType,
    } as Student;
  }, [auth.currentUser]);

  const currentUserId = currentUser.id;

  // If a real authenticated user replaces the mock 'current' user, rewrite the mock follow graph
  // so the UI still works (frontend-only state).
  useEffect(() => {
    if (currentUserId === 'current') return;

    setFollowGraph((prev) => {
      // Already normalized
      if (prev.followersByUserId[currentUserId] || prev.followingByUserId[currentUserId]) {
        return prev;
      }

      const rewriteId = (id: string) => (id === 'current' ? currentUserId : id);

      const rewriteRecord = (rec: Record<string, string[]>) => {
        const out: Record<string, string[]> = {};
        for (const [k, v] of Object.entries(rec)) {
          out[rewriteId(k)] = v.map(rewriteId);
        }
        return out;
      };

      return {
        followersByUserId: rewriteRecord(prev.followersByUserId),
        followingByUserId: rewriteRecord(prev.followingByUserId),
        incomingRequestsByUserId: rewriteRecord(prev.incomingRequestsByUserId),
        outgoingRequestsByUserId: rewriteRecord(prev.outgoingRequestsByUserId),
      };
    });
  }, [currentUserId]);

  // Ensure the authenticated user is present in the in-memory students list (used by Network/Profile lookups).
  useEffect(() => {
    if (!auth.currentUser) return;

    setStudents((prev) => {
      const filtered = prev.filter((s) => s.id !== 'current' && s.id !== currentUserId);
      return [currentUser, ...filtered];
    });
  }, [auth.currentUser, currentUser, currentUserId]);

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
        const newComment = {
          id: Date.now().toString(),
          authorId: currentUserId,
          authorName: currentUser.name,
          authorAvatar: currentUser.avatar,
          content: commentText,
          timestamp: new Date().toISOString(),
        };
        return {
          ...opp,
          comments: [...opp.comments, newComment]
        };
      }
      return opp;
    }));
  };

  const handleDeleteOpportunity = (opportunityId: string) => {
    setOpportunities(opportunities.filter(opp => opp.id !== opportunityId));
    toast.success('Post deleted successfully');
  };

  // Create post handler
  const handleCreatePost = (post: Opportunity) => {
    setOpportunities([post, ...opportunities]);
  };

  // Create event handler
  const handleCreateEvent = (event: Opportunity) => {
    setOpportunities([event, ...opportunities]);
  };

  // Follow system handlers (frontend-only mock state; future API-ready)
  const uniq = (arr: string[]) => Array.from(new Set(arr));
  const addUnique = (arr: string[], id: string) => (arr.includes(id) ? arr : [...arr, id]);
  const removeId = (arr: string[], id: string) => arr.filter((x) => x !== id);

  const getAccountType = (userId: string) => {
    return students.find((s) => s.id === userId)?.accountType ?? 'public';
  };

  const handleFollow = (targetUserId: string) => {
    const targetAccountType = getAccountType(targetUserId);

    setFollowGraph((prev) => {
      const followersByUserId = { ...prev.followersByUserId };
      const followingByUserId = { ...prev.followingByUserId };
      const incomingRequestsByUserId = { ...prev.incomingRequestsByUserId };
      const outgoingRequestsByUserId = { ...prev.outgoingRequestsByUserId };

      const alreadyFollowing = (followingByUserId[currentUserId] ?? []).includes(targetUserId);
      const alreadyRequested = (outgoingRequestsByUserId[currentUserId] ?? []).includes(targetUserId);
      if (alreadyFollowing || alreadyRequested) return prev;

      if (targetAccountType === 'private') {
        outgoingRequestsByUserId[currentUserId] = addUnique(outgoingRequestsByUserId[currentUserId] ?? [], targetUserId);
        incomingRequestsByUserId[targetUserId] = addUnique(incomingRequestsByUserId[targetUserId] ?? [], currentUserId);
      } else {
        followingByUserId[currentUserId] = addUnique(followingByUserId[currentUserId] ?? [], targetUserId);
        followersByUserId[targetUserId] = addUnique(followersByUserId[targetUserId] ?? [], currentUserId);
      }

      // Keep arrays clean/unique.
      followingByUserId[currentUserId] = uniq(followingByUserId[currentUserId] ?? []);
      outgoingRequestsByUserId[currentUserId] = uniq(outgoingRequestsByUserId[currentUserId] ?? []);
      incomingRequestsByUserId[targetUserId] = uniq(incomingRequestsByUserId[targetUserId] ?? []);
      followersByUserId[targetUserId] = uniq(followersByUserId[targetUserId] ?? []);

      return {
        followersByUserId,
        followingByUserId,
        incomingRequestsByUserId,
        outgoingRequestsByUserId,
      };
    });
  };

  const handleUnfollow = (targetUserId: string) => {
    setFollowGraph((prev) => {
      const followersByUserId = { ...prev.followersByUserId };
      const followingByUserId = { ...prev.followingByUserId };

      followingByUserId[currentUserId] = removeId(followingByUserId[currentUserId] ?? [], targetUserId);
      followersByUserId[targetUserId] = removeId(followersByUserId[targetUserId] ?? [], currentUserId);

      return {
        ...prev,
        followersByUserId,
        followingByUserId,
      };
    });
  };

  const handleCancelRequest = (targetUserId: string) => {
    setFollowGraph((prev) => {
      const incomingRequestsByUserId = { ...prev.incomingRequestsByUserId };
      const outgoingRequestsByUserId = { ...prev.outgoingRequestsByUserId };

      outgoingRequestsByUserId[currentUserId] = removeId(outgoingRequestsByUserId[currentUserId] ?? [], targetUserId);
      incomingRequestsByUserId[targetUserId] = removeId(incomingRequestsByUserId[targetUserId] ?? [], currentUserId);

      return {
        ...prev,
        incomingRequestsByUserId,
        outgoingRequestsByUserId,
      };
    });
  };

  const handleRemoveFollower = (followerUserId: string) => {
    setFollowGraph((prev) => {
      const followersByUserId = { ...prev.followersByUserId };
      const followingByUserId = { ...prev.followingByUserId };

      followersByUserId[currentUserId] = removeId(followersByUserId[currentUserId] ?? [], followerUserId);
      followingByUserId[followerUserId] = removeId(followingByUserId[followerUserId] ?? [], currentUserId);

      return {
        ...prev,
        followersByUserId,
        followingByUserId,
      };
    });
  };

  const handleAcceptFollowRequest = (requesterUserId: string) => {
    setFollowGraph((prev) => {
      const followersByUserId = { ...prev.followersByUserId };
      const followingByUserId = { ...prev.followingByUserId };
      const incomingRequestsByUserId = { ...prev.incomingRequestsByUserId };
      const outgoingRequestsByUserId = { ...prev.outgoingRequestsByUserId };

      incomingRequestsByUserId[currentUserId] = removeId(incomingRequestsByUserId[currentUserId] ?? [], requesterUserId);
      outgoingRequestsByUserId[requesterUserId] = removeId(outgoingRequestsByUserId[requesterUserId] ?? [], currentUserId);

      // Accepting turns the requester into a follower.
      followersByUserId[currentUserId] = addUnique(followersByUserId[currentUserId] ?? [], requesterUserId);
      followingByUserId[requesterUserId] = addUnique(followingByUserId[requesterUserId] ?? [], currentUserId);

      return {
        followersByUserId,
        followingByUserId,
        incomingRequestsByUserId,
        outgoingRequestsByUserId,
      };
    });
  };

  const handleRejectFollowRequest = (requesterUserId: string) => {
    setFollowGraph((prev) => {
      const incomingRequestsByUserId = { ...prev.incomingRequestsByUserId };
      const outgoingRequestsByUserId = { ...prev.outgoingRequestsByUserId };

      incomingRequestsByUserId[currentUserId] = removeId(incomingRequestsByUserId[currentUserId] ?? [], requesterUserId);
      outgoingRequestsByUserId[requesterUserId] = removeId(outgoingRequestsByUserId[requesterUserId] ?? [], currentUserId);

      return {
        ...prev,
        incomingRequestsByUserId,
        outgoingRequestsByUserId,
      };
    });
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
      case 'follow':
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

  const currentFollowerCount = (followGraph.followersByUserId[currentUserId] ?? []).length;
  const currentFollowingCount = (followGraph.followingByUserId[currentUserId] ?? []).length;

  if (auth.isLoading) {
    return <LoadingState type="page" />;
  }

  if (!auth.isAuthenticated) {
    return <AuthPage />;
  }
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
      <div className="flex justify-center flex-1">
        {activeTab === 'feed' ? (
          <div className="flex w-full xl:max-w-7xl">
            {/* Profile Section (Left) - Visible on XL screens and up */}
             <div className="w-[280px] min-w-[280px] px-2 overflow-y-auto h-[calc(100vh-4rem)] hidden xl:block flex-shrink-0">
              <ProfileCard
                student={currentUser}
                followerCount={currentFollowerCount}
                followingCount={currentFollowingCount}
                onViewProfile={() => handleViewProfile(currentUserId)}
              />
            </div>
            {/* Feed Section (Center) - Expands to fill space */}
            <div className="px-2 overflow-y-auto h-[calc(100vh-4rem)] w-full lg:w-3/4 xl:w-1/2" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
              <FeedPage
                opportunities={opportunities}
                currentUserId={currentUserId}
                currentUser={currentUser}
                students={students}
                onLike={handleLike}
                onSave={handleSave}
                onComment={handleComment}
                onDelete={handleDeleteOpportunity}
                onCreateOpportunity={handleCreateOpportunity}
                onCreatePost={handleCreatePost}
                onCreateEvent={handleCreateEvent}
                onViewProfile={() => handleViewProfile(currentUserId)}
                onViewStudentProfile={handleViewProfile}
              />
            </div>
            {/* Suggestions Section (Right) - Visible on LG screens and up */}
            <div className="w-1/4 px-2 overflow-y-auto h-[calc(100vh-4rem)] hidden lg:block" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
              <SuggestionsCard
                students={students}
                currentUserId={currentUserId}
                followGraph={followGraph}
                onFollow={handleFollow}
                onUnfollow={handleUnfollow}
                onCancelRequest={handleCancelRequest}
                onViewProfile={handleViewProfile}
              />
            </div>
          </div>
        ) : activeTab === 'search' ? (
          <SearchPage
            students={students}
            currentUserId={currentUserId}
            followGraph={followGraph}
            onFollow={handleFollow}
            onUnfollow={handleUnfollow}
            onCancelRequest={handleCancelRequest}
            onViewProfile={handleViewProfile}
            initialSearchQuery={searchQuery}
          />
        ) : activeTab === 'network' ? (
          <NetworkPage
            students={students}
            currentUserId={currentUserId}
            followGraph={followGraph}
            onFollow={handleFollow}
            onUnfollow={handleUnfollow}
            onCancelRequest={handleCancelRequest}
            onRemoveFollower={handleRemoveFollower}
            onAcceptRequest={handleAcceptFollowRequest}
            onRejectRequest={handleRejectFollowRequest}
            onViewProfile={handleViewProfile}
          />
        ) : activeTab === 'chat' ? (
          <ChatPage
            conversations={conversations}
            students={students}
            currentUserId={currentUserId}
            onViewProfile={handleViewProfile}
            onChatClick={handleChatClick}
          />
        ) : activeTab === 'clubs' ? (
          <ClubsPage
            clubs={clubs}
            students={students}
            currentUserId={currentUserId}
            onJoinClub={handleJoinClub}
            onLeaveClub={handleLeaveClub}
            onCreateClub={handleCreateClub}
            onViewProfile={handleViewProfile}
          />
        ) : activeTab === 'profile' ? (
          <ProfilePage
            student={displayedStudent}
            currentUserId={currentUserId}
            isOwnProfile={displayedStudent.id === currentUserId}
            followGraph={followGraph}
            onFollow={handleFollow}
            onUnfollow={handleUnfollow}
            onCancelRequest={handleCancelRequest}
            onEdit={handleEditProfile}
            opportunities={opportunities}
            onLike={handleLike}
            onSave={handleSave}
            onComment={handleComment}
          />
        ) : activeTab === 'notifications' ? (
          <NotificationsPage
            notifications={notifications}
            onMarkAsRead={handleMarkAsRead}
            onMarkAllAsRead={handleMarkAllAsRead}
            onNotificationClick={handleNotificationClick}
          />
        ) : activeTab === 'settings' ? (
          <SettingsPage
            student={currentUser}
            onEdit={handleEditProfile}
            onUpdateSettings={handleUpdateSettings}
          />
        ) : null}
      </div>

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