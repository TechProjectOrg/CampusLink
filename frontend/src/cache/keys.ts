export const cacheKeys = {
  entity: {
    user: (id: string) => `entity:user:${id}`,
    userProfile: (id: string) => `entity:user_profile:${id}`,
    post: (id: string) => `entity:post:${id}`,
    club: (id: string) => `entity:club:${id}`,
    notification: (id: string) => `entity:notification:${id}`,
    conversation: (id: string) => `entity:conversation:${id}`,
  },
  page: {
    feedHome: (limit: number, offset: number) => `page:feed:home:${limit}:${offset}`,
    feedHashtag: (hashtag: string, limit: number, offset: number) =>
      `page:feed:hashtag:${hashtag.trim().toLowerCase()}:${limit}:${offset}`,
    userPosts: (userId: string) => `page:user:${userId}:posts`,
    clubPosts: (clubId: string, sort: string, limit: number, offset: number) =>
      `page:club:${clubId}:posts:${sort}:${limit}:${offset}`,
    postComments: (postId: string, cursor?: string | null) =>
      `page:post:${postId}:comments:${cursor && cursor.trim() ? cursor : 'root'}`,
    commentReplies: (commentId: string, cursor?: string | null) =>
      `page:comment:${commentId}:replies:${cursor && cursor.trim() ? cursor : 'root'}`,
    clubMembers: (clubId: string, limit: number, offset: number) =>
      `page:club:${clubId}:members:${limit}:${offset}`,
    searchAll: (
      query: string,
      usersOffset = 0,
      hashtagsOffset = 0,
      clubsOffset = 0,
    ) => `page:search:all:${query.trim().toLowerCase()}:${usersOffset}:${hashtagsOffset}:${clubsOffset}`,
  },
  list: {
    chatConversations: () => 'list:chat:conversations:active',
    notifications: () => 'list:notifications',
    followGraph: (userId: string) => `list:network:graph:${userId}`,
    clubs: (query = 'default') => `list:clubs:${query}`,
  },
} as const;
