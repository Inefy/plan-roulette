// src/lib/remoteErrors.ts
export type RemoteAction =
  | 'close_voting'
  | 'create_room'
  | 'itinerary_fetch'
  | 'join_room'
  | 'resolve_invite'
  | 'result_fetch'
  | 'room_fetch'
  | 'save_room'
  | 'share_link'
  | 'vote_save';

export type FriendlyRemoteError = {
  isOffline: boolean;
  message: string;
  retryable: boolean;
  title: string;
};

const offlineMessagePatterns = [
  'failed to fetch',
  'network request failed',
  'fetch failed',
  'load failed',
  'internet connection appears to be offline',
  'networkerror',
  'err_internet_disconnected',
  'unable to resolve host',
  'connection was lost',
  'connection is offline',
  'offline',
];

const offlineErrorsByAction: Record<RemoteAction, Omit<FriendlyRemoteError, 'isOffline'>> = {
  close_voting: {
    message: 'Picking a winner needs an internet connection. Reconnect and try closing voting again.',
    retryable: true,
    title: 'You are offline',
  },
  create_room: {
    message: 'Your option deck was generated locally, but creating the room needs an internet connection. Reconnect and try again.',
    retryable: true,
    title: 'You are offline',
  },
  itinerary_fetch: {
    message: 'The itinerary needs an internet connection to load. Reconnect and retry.',
    retryable: true,
    title: 'You are offline',
  },
  join_room: {
    message: 'Joining this room needs an internet connection. Reconnect and try joining again.',
    retryable: true,
    title: 'You are offline',
  },
  resolve_invite: {
    message: 'This invite needs an internet connection to open. Reconnect and retry.',
    retryable: true,
    title: 'You are offline',
  },
  result_fetch: {
    message: 'The result needs an internet connection to load. Reconnect and retry.',
    retryable: true,
    title: 'You are offline',
  },
  room_fetch: {
    message: 'The room needs an internet connection to refresh. Reconnect and retry.',
    retryable: true,
    title: 'You are offline',
  },
  save_room: {
    message: 'Saving this room needs an internet connection. Reconnect and try again.',
    retryable: true,
    title: 'You are offline',
  },
  share_link: {
    message: 'Sharing is unavailable right now. The link is still available to copy.',
    retryable: false,
    title: 'Sharing unavailable',
  },
  vote_save: {
    message: 'Your vote is still on screen, but saving needs an internet connection. Reconnect and tap Retry save.',
    retryable: true,
    title: 'You are offline',
  },
};

export function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  return '';
}

export function isOfflineErrorMessage(message: string) {
  const normalizedMessage = message.toLowerCase();

  return offlineMessagePatterns.some((pattern) => normalizedMessage.includes(pattern));
}

export function isOfflineError(error: unknown) {
  return isOfflineErrorMessage(getErrorMessage(error));
}

export function getFriendlyRemoteError(
  error: unknown,
  action: RemoteAction,
  fallback: Omit<FriendlyRemoteError, 'isOffline'>,
): FriendlyRemoteError {
  const rawMessage = getErrorMessage(error);

  if (isOfflineErrorMessage(rawMessage)) {
    return {
      ...offlineErrorsByAction[action],
      isOffline: true,
    };
  }

  return {
    ...fallback,
    isOffline: false,
    message: rawMessage || fallback.message,
  };
}
