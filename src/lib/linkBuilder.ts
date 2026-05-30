// src/lib/linkBuilder.ts
export type InviteLinkEnvironment = 'development' | 'production';

declare const __DEV__: boolean | undefined;

const productionBaseUrl = 'https://planroulette.app/join';
const developmentBaseUrl = 'planroulette://join';

function getDefaultInviteLinkEnvironment(): InviteLinkEnvironment {
  return typeof __DEV__ !== 'undefined' && __DEV__ ? 'development' : 'production';
}

export function buildInviteLink(token: string, environment: InviteLinkEnvironment = getDefaultInviteLinkEnvironment()) {
  const trimmedToken = token.trim();

  if (!trimmedToken) {
    throw new Error('Invite token is required to build a link.');
  }

  const encodedToken = encodeURIComponent(trimmedToken);
  const baseUrl = environment === 'production' ? productionBaseUrl : developmentBaseUrl;

  return `${baseUrl}/${encodedToken}`;
}

export function buildInviteShareMessage(link: string) {
  return `Vote on what we’re doing tonight: ${link}`;
}

export function parseInviteTokenFromLink(link: string) {
  const trimmedLink = link.trim();

  if (!trimmedLink) {
    return undefined;
  }

  try {
    const parsedUrl = new URL(trimmedLink);
    const pathSegments = parsedUrl.pathname.split('/').filter(Boolean);

    if (parsedUrl.protocol === 'planroulette:' && parsedUrl.hostname === 'join') {
      return pathSegments[0] ? decodeURIComponent(pathSegments[0]) : undefined;
    }

    if (parsedUrl.hostname === 'planroulette.app' && pathSegments[0] === 'join' && pathSegments[1]) {
      return decodeURIComponent(pathSegments[1]);
    }
  } catch {
    return undefined;
  }

  return undefined;
}
