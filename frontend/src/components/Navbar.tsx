import { useState } from 'react';
import { Home, Search, Users, MessageCircle, BookOpen, User, Bell } from 'lucide-react';
import { Badge } from './ui/badge';
import { Input } from './ui/input';

interface NavbarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  unreadCount?: number;
  unreadNotifications?: number;
  onSearch?: (query: string) => void;
}

export function Navbar({ activeTab, onTabChange, unreadCount = 0, unreadNotifications = 0, onSearch }: NavbarProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const navItems = [
    { id: 'feed', label: 'Feed', icon: Home },
    { id: 'network', label: 'Network', icon: Users },
    { id: 'chat', label: 'Chat', icon: MessageCircle, badge: unreadCount },
    { id: 'clubs', label: 'Clubs', icon: BookOpen },
    { id: 'profile', label: 'Profile', icon: User }
  ];

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
    if (onSearch) {
      onSearch(e.target.value);
    }
  };

  const handleSearchFocus = () => {
    if (activeTab !== 'search') {
      onTabChange('search');
    }
  };

  return (
    <nav className="sticky top-0 z-50 backdrop-blur-xl bg-gradient-to-r from-primary via-secondary to-primary shadow-lg animate-slide-in-down">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center gap-4 h-16">
          {/* Logo */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="bg-white/20 backdrop-blur-lg text-white rounded-xl p-2 shadow-lg hover-lift border border-white/30">
              <Users className="w-6 h-6" />
            </div>
            <span className="text-white text-xl tracking-tight hidden sm:inline">CampusLink</span>
          </div>

          {/* Search Bar - Desktop */}
          <div className="hidden md:flex flex-1 max-w-2xl mx-4">
            <div className="relative w-full">
              <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-white/70" />
              <Input
                type="text"
                placeholder="Search students, skills, or opportunities..."
                value={searchQuery}
                onChange={handleSearchChange}
                onFocus={handleSearchFocus}
                className="pl-12 pr-4 h-11 bg-white/20 backdrop-blur-lg border-white/30 text-white placeholder:text-white/70 rounded-2xl focus:bg-white/30 focus:border-white/50 transition-all duration-300 hover:bg-white/25"
              />
            </div>
          </div>

          {/* Navigation Items - Desktop */}
          <div className="hidden md:flex items-center gap-1 flex-shrink-0">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              
              return (
                <button
                  key={item.id}
                  onClick={() => onTabChange(item.id)}
                  className={`relative flex flex-col items-center gap-1 px-4 py-2 rounded-xl transition-all duration-300 ${
                    isActive
                      ? 'text-white bg-white/20 shadow-lg scale-105 border border-white/30'
                      : 'text-white/80 hover:bg-white/10 hover:text-white hover:scale-105'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span className="text-xs">{item.label}</span>
                  {item.badge && item.badge > 0 && (
                    <Badge className="absolute -top-1 -right-1 bg-destructive text-white px-1.5 py-0 min-w-5 h-5 flex items-center justify-center animate-pulse shadow-lg">
                      {item.badge}
                    </Badge>
                  )}
                </button>
              );
            })}
          </div>

          {/* Notifications - Desktop */}
          <button 
            onClick={() => onTabChange('notifications')}
            className={`hidden md:flex p-2 rounded-xl relative transition-all duration-300 hover:scale-110 border border-white/20 ${
              activeTab === 'notifications' ? 'bg-white/20' : 'hover:bg-white/10'
            }`}
          >
            <Bell className="w-5 h-5 text-white" />
            {unreadNotifications > 0 && (
              <Badge className="absolute -top-1 -right-1 bg-destructive text-white px-1.5 py-0 min-w-5 h-5 flex items-center justify-center animate-pulse shadow-lg">
                {unreadNotifications}
              </Badge>
            )}
          </button>

          {/* Search Icon - Mobile */}
          <button 
            onClick={handleSearchFocus}
            className="md:hidden p-2 rounded-xl hover:bg-white/10 relative transition-all duration-300 hover:scale-110 ml-auto"
          >
            <Search className="w-5 h-5 text-white" />
          </button>

          {/* Notifications - Mobile */}
          <button 
            onClick={() => onTabChange('notifications')}
            className={`md:hidden p-2 rounded-xl relative transition-all duration-300 hover:scale-110 ${
              activeTab === 'notifications' ? 'bg-white/20' : 'hover:bg-white/10'
            }`}
          >
            <Bell className="w-5 h-5 text-white" />
            {unreadNotifications > 0 && (
              <Badge className="absolute -top-1 -right-1 bg-destructive text-white px-1 py-0 min-w-4 h-4 flex items-center justify-center text-xs animate-pulse">
                {unreadNotifications}
              </Badge>
            )}
          </button>
        </div>

        {/* Mobile Search Bar */}
        {activeTab === 'search' && (
          <div className="md:hidden pb-3 animate-fade-in">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-white/70" />
              <Input
                type="text"
                placeholder="Search students, skills..."
                value={searchQuery}
                onChange={handleSearchChange}
                className="pl-12 pr-4 h-11 bg-white/20 backdrop-blur-lg border-white/30 text-white placeholder:text-white/70 rounded-2xl focus:bg-white/30 focus:border-white/50 transition-all duration-300"
              />
            </div>
          </div>
        )}

        {/* Mobile Navigation */}
        <div className="md:hidden fixed bottom-0 left-0 right-0 backdrop-blur-xl bg-gradient-to-r from-primary via-secondary to-primary border-t border-white/20 flex items-center justify-around py-2 px-2 shadow-2xl z-50">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            
            return (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                className={`relative flex flex-col items-center gap-1 px-3 py-2 rounded-xl transition-all duration-300 ${
                  isActive 
                    ? 'text-white bg-white/20 scale-110 shadow-lg border border-white/30' 
                    : 'text-white/80 hover:text-white'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-xs">{item.label}</span>
                {item.badge && item.badge > 0 && (
                  <Badge className="absolute -top-1 -right-1 bg-destructive text-white px-1.5 py-0 min-w-5 h-5 flex items-center justify-center animate-pulse">
                    {item.badge}
                  </Badge>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
