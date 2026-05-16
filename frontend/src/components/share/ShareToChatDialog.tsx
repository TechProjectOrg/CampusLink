import React, { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { useAppDataSelector, useAppDataStore } from '../../context/AppDataContext';
import type { Opportunity } from '../../types';

interface ShareToChatDialogProps {
  isOpen: boolean;
  onClose: () => void;
  post: Opportunity;
}

export function ShareToChatDialog({ isOpen, onClose, post }: ShareToChatDialogProps) {
  const appData = useAppDataStore();
  const conversationsById = useAppDataSelector((s) => s.chat.conversationsById);
  const conversationOrder = useAppDataSelector((s) => s.chat.conversationOrder);
  const isListHydrated = useAppDataSelector((s) => s.chat.isListHydrated);
  const [query, setQuery] = useState('');
  const [sendingTo, setSendingTo] = useState<string | null>(null);

  const shareUrl = typeof window !== 'undefined' ? `${window.location.origin}/posts/${post.id}` : `/posts/${post.id}`;
  // The composer should start empty — the link will be appended when sending.
  const [message, setMessage] = useState('');

  const convs = useMemo(() => {
    const list = conversationOrder.map((id) => conversationsById[id]).filter(Boolean);
    if (!query.trim()) return list;
    const q = query.toLowerCase();
    return list.filter((c) => (c.name || '').toLowerCase().includes(q) || (c.lastMessage?.content || '').toLowerCase().includes(q));
  }, [conversationOrder, conversationsById, query]);

  // ensure conversations are loaded when dialog opens
  React.useEffect(() => {
    if (!isOpen) return;
    void appData.ensureConversations?.({ force: false });
  }, [isOpen, appData]);

  const handleSend = async (chatId: string) => {
    try {
      setSendingTo(chatId);
      const trimmed = message.trim();
      const contentToSend = trimmed ? `${trimmed}\n\n${shareUrl}` : shareUrl;
      await appData.sendMessage(chatId, { content: contentToSend });
      onClose();
    } catch (err) {
      // swallow; UI could show toast
      // console.error(err);
    } finally {
      setSendingTo(null);
    }
  };

  const handleCopyLink = async () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(shareUrl);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="cl-share-dialog sm:max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Share to chat</DialogTitle>
          <DialogDescription>Pick a conversation to share this post or copy its link.</DialogDescription>
        </DialogHeader>

        <div className="px-6 pt-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search conversations..." className="pl-10 rounded-xl" />
          </div>
        </div>

        <div className="px-6 pt-4 space-y-3 overflow-y-auto flex-1">
          <div className="rounded-xl bg-gray-50 p-3">
            <div className="flex items-start gap-3">
              <Avatar className="w-10 h-10">
                {post.image ? <AvatarImage src={post.image} /> : <AvatarFallback>{post.authorName?.[0] ?? 'P'}</AvatarFallback>}
              </Avatar>
              <div className="flex-1">
                <p className="text-sm font-semibold text-gray-900 truncate">{post.title}</p>
                <p className="text-sm text-gray-500 truncate">{post.description}</p>
                <div className="mt-2 flex items-center gap-2">
                  <Button size="sm" variant="outline" onClick={handleCopyLink}>Copy link</Button>
                </div>
              </div>
            </div>
          </div>

          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Conversations</p>
            <div className="space-y-2 max-h-64">
              {!isListHydrated && (
                <p className="text-sm text-gray-500">Loading conversations...</p>
              )}
              {isListHydrated && convs.length === 0 && <p className="text-sm text-gray-500">No conversations found</p>}
              {convs.map((c) => {
                const displayName = (c as any).name ?? c.participantName ?? 'Conversation';
                const avatarUrl = (c as any).avatar ?? c.participantAvatar ?? undefined;
                return (
                  <div key={c.id} className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 border border-transparent hover:border-gray-100">
                    <Avatar className="w-10 h-10 ring-1 ring-primary/10">
                      {avatarUrl ? <AvatarImage src={avatarUrl} /> : <AvatarFallback>{displayName[0]}</AvatarFallback>}
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{displayName}</p>
                    </div>
                    <div className="flex-shrink-0">
                      <Button size="sm" variant="ghost" className="bg-primary text-white rounded-full px-4 py-1" disabled={sendingTo === c.id} onClick={() => void handleSend(c.id)}>
                        {sendingTo === c.id ? 'Sending...' : 'Send'}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="px-6 pb-6 pt-4 border-t bg-white">
          <p className="text-sm font-medium text-gray-700 mb-2">Add a message (optional)</p>
          <textarea placeholder="Write an optional message to include with the link" value={message} onChange={(e) => setMessage(e.target.value)} rows={3} className="w-full rounded-xl border p-3 text-sm" />
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default ShareToChatDialog;
