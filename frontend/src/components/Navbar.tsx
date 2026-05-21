import { useEffect, useRef, useState } from 'react';
import { Home, Search, Users, MessageCircle, BookOpen, User, Bell, Settings, LogOut, Menu, Bookmark, X } from 'lucide-react';
import { Badge } from './ui/badge';
import { Input } from './ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { useAuth } from '../context/AuthContext';

interface NavbarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  onOpenSavedPosts?: () => void;
  unreadCount?: number;
  unreadNotifications?: number;
  onSearch?: (query: string) => void;
  shouldRenderMobileTopHeader?: boolean;
  isMobileTopNavVisible?: boolean;
}

export function Navbar({
  activeTab,
  onTabChange,
  onOpenSavedPosts,
  unreadCount = 0,
  unreadNotifications = 0,
  onSearch,
  shouldRenderMobileTopHeader = false,
  isMobileTopNavVisible = true,
}: NavbarProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
  const mobileSearchInputRef = useRef<HTMLInputElement | null>(null);
  const { logout, profile } = useAuth();
  const navbarProfilePhoto = profile?.profilePictureUrl ?? null;
  const showMobileTopActions = shouldRenderMobileTopHeader;
  const shouldShowMobileTopNav = shouldRenderMobileTopHeader && (isMobileSearchOpen || isMobileTopNavVisible);

  const navItems = [
    { id: 'feed', label: 'Feed', icon: Home },
    { id: 'network', label: 'Network', icon: Users },
    { id: 'chat', label: 'Chat', icon: MessageCircle, badge: unreadCount },
    { id: 'clubs', label: 'Clubs', icon: BookOpen }
  ];

  const mobileNavItems = [
    { id: 'feed', label: 'Home', icon: Home },
    { id: 'network', label: 'Network', icon: Users },
    { id: 'chat', label: 'Chat', icon: MessageCircle, badge: unreadCount },
    { id: 'clubs', label: 'Clubs', icon: BookOpen },
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

  const handleTabNavigate = (tab: string) => {
    if (tab !== 'search') {
      setIsMobileSearchOpen(false);
    }
    onTabChange(tab);
  };

  const handleTabletSearchToggle = () => {
    setIsMobileSearchOpen((current) => !current);
    if (!isMobileSearchOpen && activeTab !== 'search') {
      onTabChange('search');
    }
  };

  const handleMobileSearchToggle = () => {
    if (isMobileSearchOpen) {
      setIsMobileSearchOpen(false);
      if (activeTab === 'search') {
        onTabChange('feed');
      }
      return;
    }

    setIsMobileSearchOpen(true);
    if (activeTab !== 'search') {
      onTabChange('search');
    }
  };

  const handleMobileSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleSearchChange(e);
    if (activeTab !== 'search') {
      onTabChange('search');
    }
  };

  useEffect(() => {
    if (activeTab !== 'search') {
      setIsMobileSearchOpen(false);
    }
  }, [activeTab]);

  useEffect(() => {
    if (!isMobileSearchOpen) return;
    mobileSearchInputRef.current?.focus();
  }, [isMobileSearchOpen]);

  return (
    <nav className={`cl-navbar-root sticky top-0 z-50 w-full overflow-x-hidden backdrop-blur-xl bg-gradient-to-r from-primary via-secondary to-primary shadow-lg animate-slide-in-down ${
      shouldRenderMobileTopHeader ? 'cl-navbar-mobile-header-enabled' : 'cl-navbar-mobile-header-disabled'
    } ${shouldShowMobileTopNav ? 'cl-navbar-mobile-visible' : 'cl-navbar-mobile-hidden'}`}>
      <div className="cl-navbar-shell max-w-7xl mx-auto px-4">
        <div className="cl-navbar-row flex items-center gap-4 h-16">
          {/* Logo */}
          <div className="hidden md:flex items-center gap-2 flex-none min-w-fit cursor-pointer" onClick={() => handleTabNavigate('feed')}>
            <div className="overflow-hidden rounded-xl border border-white/30 bg-white/20 shadow-lg backdrop-blur-lg hover-lift">
              <img src="/logo.png" alt="CampusLynk logo" className="h-10 w-10 object-cover" />
            </div>
            <span className="cl-navbar-logo-text text-white text-xl tracking-tight">CampusLynk</span>
          </div>

          {showMobileTopActions ? (
            isMobileSearchOpen ? (
              <div className="cl-mobile-inline-search md:hidden">
                <div className="cl-mobile-inline-search-field">
                  <Search className="cl-mobile-inline-search-icon" />
                  <Input
                    ref={mobileSearchInputRef}
                    type="text"
                    placeholder="Search users or tags"
                    value={searchQuery}
                    onChange={handleMobileSearchChange}
                    onFocus={handleSearchFocus}
                    className="cl-mobile-inline-search-input"
                  />
                  <button
                    type="button"
                    aria-label="Close search"
                    onClick={handleMobileSearchToggle}
                    className="cl-mobile-inline-search-close"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ) : (
              <button
                aria-label="Open profile"
                onClick={() => handleTabNavigate('profile')}
                className="cl-mobile-top-action cl-mobile-profile-action md:hidden relative overflow-hidden rounded-full border border-white/30 shadow-lg"
              >
                <Avatar className="h-9 w-9">
                  <AvatarImage src={navbarProfilePhoto ?? undefined} alt="My profile" className="object-cover" />
                  <AvatarFallback className="bg-white/20 text-white text-sm font-medium">
                    {profile?.displayName?.[0] ?? profile?.username?.[0] ?? 'U'}
                  </AvatarFallback>
                </Avatar>
              </button>
            )
          ) : (
            <div className="md:hidden flex h-9 w-9 flex-shrink-0" aria-hidden="true" />
          )}

          {/* Search Bar - Desktop */}
          <div className="cl-navbar-search hidden md:flex flex-1 max-w-2xl mx-4">
            <button
              type="button"
              onClick={handleTabletSearchToggle}
              aria-label="Search"
              aria-expanded={isMobileSearchOpen}
              className="cl-navbar-tablet-search-button hidden items-center justify-center rounded-2xl bg-white/20 backdrop-blur-lg border border-white/30 text-white transition-all duration-300 hover:bg-white/25 focus:bg-white/30 focus:border-white/50"
            >
              <Search className="w-5 h-5" />
            </button>
            <div className="cl-navbar-search-field relative w-full">
              <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-white/70" />
              <Input
                type="text"
                placeholder="Search users or tags"
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
                  onClick={() => handleTabNavigate(item.id)}
                  aria-label={item.label}
                  className={`cl-navbar-nav-button relative flex flex-col items-center justify-center gap-1 w-24 h-14 rounded-xl border transition-all duration-300 ${
                    isActive
                      ? 'text-white bg-white/20 shadow-lg border-white/30'
                      : 'text-white/80 border-white/10 hover:bg-white/10 hover:text-white hover:border-white/20'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span className="text-xs leading-none whitespace-nowrap">{item.label}</span>
                  {(item.badge ?? 0) > 0 && (
                    <Badge className="absolute -top-1 -right-1 bg-destructive text-white px-1.5 py-0 min-w-5 h-5 flex items-center justify-center animate-pulse shadow-lg text-xs">
                      {item.badge}
                    </Badge>
                  )}
                </button>
              );
            })}

            <button 
              onClick={() => handleTabNavigate('notifications')}
              aria-label="Notifications"
              className={`cl-navbar-nav-button flex flex-col items-center justify-center gap-1 w-24 h-14 rounded-xl border relative transition-all duration-300 ${
                activeTab === 'notifications' ? 'text-white bg-white/20 shadow-lg border-white/30' : 'text-white/80 border-white/10 hover:bg-white/10 hover:text-white hover:border-white/20'
              }`}
            >
              <Bell className="w-5 h-5" />
              <span className="text-xs leading-none whitespace-nowrap">Notifications</span>
              {unreadNotifications > 0 && (
                <Badge className="absolute -top-1 -right-1 bg-destructive text-white px-1.5 py-0 min-w-5 h-5 flex items-center justify-center animate-pulse shadow-lg text-xs">
                  {unreadNotifications}
                </Badge>
              )}
            </button>

            {/* Profile Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  aria-label="Me"
                  className={`flex items-center justify-center w-14 h-14 rounded-full border relative transition-all duration-300 ${
                    activeTab === 'profile' || activeTab === 'settings'
                      ? 'text-white bg-white/20 shadow-lg border-white/30'
                      : 'text-white/80 border-white/10 hover:bg-white/10 hover:text-white hover:border-white/20'
                  }`}
                >
                  {navbarProfilePhoto ? (
                    <img
                      src={navbarProfilePhoto}
                      alt="My profile"
                      className="w-11 h-11 rounded-full object-cover border border-white/40"
                    />
                  ) : (
                    <User className="w-7 h-7" />
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-48" align="end">
                <DropdownMenuItem onClick={() => handleTabNavigate('profile')}>
                  <User className="mr-2 h-4 w-4" />
                  <span>Profile</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onOpenSavedPosts?.()}>
                  <Bookmark className="mr-2 h-4 w-4" />
                  <span>Saved Posts</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleTabNavigate('settings')}>
                  <Settings className="mr-2 h-4 w-4" />
                  <span>Settings</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={logout}
                  className="text-red-600 focus:text-red-600 focus:bg-red-50"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Sign Out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>



          {showMobileTopActions && !isMobileSearchOpen && (
            <div className="cl-mobile-top-actions-group md:hidden">
              {/* Search Icon - Mobile */}
              <button 
                onClick={handleMobileSearchToggle}
                aria-label="Search"
                aria-expanded={isMobileSearchOpen}
                className="cl-mobile-top-action md:hidden p-2 rounded-xl relative transition-all duration-300 hover:scale-110"
              >
                <Search className="w-5 h-5" />
              </button>

              {/* Notifications - Mobile */}
              <button 
                onClick={() => handleTabNavigate('notifications')}
                aria-label="Notifications"
                className="cl-mobile-top-action md:hidden p-2 rounded-xl relative transition-all duration-300 hover:scale-110"
              >
                <Bell className="w-5 h-5" />
                {unreadNotifications > 0 && (
                  <Badge className="absolute -top-1 -right-1 bg-destructive text-white px-1 py-0 min-w-4 h-4 flex items-center justify-center text-xs animate-pulse">
                    {unreadNotifications}
                  </Badge>
                )}
              </button>

              {/* More Menu - Mobile */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    aria-label="Open navigation menu"
                    className="cl-mobile-top-action md:hidden p-2 rounded-xl transition-all duration-300 hover:scale-110"
                  >
                    <Menu className="w-5 h-5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-52" align="end">
                  <DropdownMenuItem onClick={() => handleTabNavigate('profile')}>
                    <User className="mr-2 h-4 w-4" />
                    <span>Profile</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onOpenSavedPosts?.()}>
                    <Bookmark className="mr-2 h-4 w-4" />
                    <span>Saved Posts</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleTabNavigate('settings')}>
                    <Settings className="mr-2 h-4 w-4" />
                    <span>Settings</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={logout}
                    className="text-red-600 focus:text-red-600 focus:bg-red-50"
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>Sign Out</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>

        {/* Mobile and tablet search panel */}
        <div
          className={`cl-navbar-mobile-search-panel lg:hidden ${
            isMobileSearchOpen ? 'cl-navbar-mobile-search-panel-open' : ''
          }`}
        >
          <div className="cl-navbar-mobile-search-inner">
            <div className="mb-4">
              <h1 className="text-gray-900 bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                Search
              </h1>
              <p className="text-gray-600">Find users and hashtags in one place</p>
            </div>
            <div className="relative">
              <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-white/70" />
              <Input
                type="text"
                placeholder="Search users or tags"
                value={searchQuery}
                onChange={handleMobileSearchChange}
                onFocus={handleSearchFocus}
                className="pl-12 pr-4 h-11 bg-white border-primary/20 text-gray-900 placeholder:text-gray-500 rounded-2xl focus:bg-white focus:border-primary/40 transition-all duration-300"
              />
            </div>
          </div>
        </div>

        {/* Mobile Navigation */}
        <div className="cl-mobile-bottom-nav md:hidden fixed bottom-0 left-0 right-0 backdrop-blur-xl bg-gradient-to-r from-primary via-secondary to-primary border-t border-white/20 flex items-center justify-center gap-2 py-2 px-4 shadow-2xl z-50 safe-area-inset-bottom">
          {mobileNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            
            return (
              <button
                key={item.id}
                onClick={() => handleTabNavigate(item.id)}
                aria-label={item.label}
                title={item.label}
                className={`relative flex h-10 flex-1 max-w-[64px] items-center justify-center rounded-2xl transition-all duration-300 ${
                  isActive 
                    ? 'cl-mobile-nav-active text-white bg-white/25 scale-105 shadow-xl border border-white/40 backdrop-blur-sm' 
                    : 'text-white/70 hover:text-white hover:bg-white/10 active:scale-95'
                }`}
              >
                <Icon className="h-5 w-5" />
                <span className="cl-mobile-nav-label sr-only">{item.label}</span>
                {(item.badge ?? 0) > 0 && (
                  <Badge className="absolute -top-1 -right-1 bg-destructive text-white px-1 py-0 min-w-4 h-4 flex items-center justify-center text-xs animate-pulse">
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
