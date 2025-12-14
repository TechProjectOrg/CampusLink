export type RequestStatus = 'none' | 'requested';

export interface FollowGraph {
  followersByUserId: Record<string, string[]>;
  followingByUserId: Record<string, string[]>;
  incomingRequestsByUserId: Record<string, string[]>;
  outgoingRequestsByUserId: Record<string, string[]>;
}

// Frontend-only mock graph.
//
// Notes:
// - followersByUserId[u] are the users who follow u.
// - followingByUserId[u] are the users u follows (accepted follows).
// - incomingRequestsByUserId[u] are users who requested to follow u (u is private).
// - outgoingRequestsByUserId[u] are users u has requested to follow.
export const mockFollowGraph: FollowGraph = {
  followersByUserId: {
    current: ['1', '3', '5'],
    '1': ['2', 'current'],
    '2': ['1'],
    '3': ['1', '2'],
    '4': ['3'],
    '5': ['2', 'current'],
    '6': ['1'],
    '7': ['1', '5'],
  },
  followingByUserId: {
    current: ['1', '2', '5'],
    '1': ['current', '3'],
    '2': ['1'],
    '3': ['current'],
    '4': [],
    '5': ['current', '7'],
    '6': [],
    '7': ['1'],
  },
  incomingRequestsByUserId: {
    current: ['2', '4', '6', '7'],
    '1': [],
    '2': [],
    '3': [],
    '4': ['current'],
    '5': [],
    '6': ['current'],
    '7': [],
  },
  outgoingRequestsByUserId: {
    current: ['4', '6'],
    '1': [],
    '2': ['current'],
    '3': [],
    '4': ['current'],
    '5': [],
    '6': ['current'],
    '7': ['current'],
  },
};
