export type AvatarTone = 'red' | 'orange' | 'green' | 'blue' | 'lavender' | 'yellow' | 'navy';

const avatarTones = ['orange', 'blue', 'green', 'lavender', 'yellow', 'red'] as const satisfies readonly AvatarTone[];

function getInitialCharacters(value: string) {
  return value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join('')
    .toUpperCase();
}

function getCompactInitials(value: string) {
  return value.replace(/\s+/g, '').slice(0, 2).toUpperCase();
}

export function getAvatarInitials(name?: string, initials?: string) {
  if (initials?.trim()) {
    return getCompactInitials(initials);
  }

  if (!name?.trim()) {
    return '?';
  }

  return getInitialCharacters(name) || '?';
}

export function getAvatarTone(index: number): AvatarTone {
  const normalizedIndex = ((index % avatarTones.length) + avatarTones.length) % avatarTones.length;

  return avatarTones[normalizedIndex];
}

export function getAvatarImageSource(avatarUrl: string | null | undefined) {
  const normalizedAvatarUrl = avatarUrl?.trim();

  if (!normalizedAvatarUrl || !/^https?:\/\//i.test(normalizedAvatarUrl)) {
    return undefined;
  }

  return {
    uri: normalizedAvatarUrl,
  };
}
