// src/lib/linkBuilder.ts
export type InviteLinkEnvironment = 'development' | 'production';

declare const __DEV__: boolean | undefined;

const productionBaseUrl = 'https://planroulette.app/join';
const developmentBaseUrl = 'planroulette://join';

function getDefaultInviteLinkEnvironment(): InviteLinkEnvironment {
  return typeof __DEV__ !== 'undefined' && __DEV__ ? 'development' : 'production';
}

function decodeInviteToken(value: string | undefined) {
  if (!value) {
    return undefined;
  }

  try {
    const decodedValue = decodeURIComponent(value).trim();

    return decodedValue || undefined;
  } catch {
    return undefined;
  }
}

function getDevelopmentInviteToken(parsedUrl: URL) {
  if (parsedUrl.protocol !== 'planroulette:') {
    return undefined;
  }

  const pathSegments = parsedUrl.pathname.split('/').filter(Boolean);

  if (parsedUrl.hostname === 'join') {
    return decodeInviteToken(pathSegments[0]);
  }

  if (!parsedUrl.hostname && pathSegments[0] === 'join') {
    return decodeInviteToken(pathSegments[1]);
  }

  return undefined;
}

function isProductionInviteHost(hostname: string) {
  const normalizedHostname = hostname.toLowerCase();

  return normalizedHostname === 'planroulette.app' || normalizedHostname === 'www.planroulette.app';
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
  return `Vote on what we're doing tonight: ${link}`;
}

export function parseInviteTokenFromLink(link: string) {
  const trimmedLink = link.trim();

  if (!trimmedLink) {
    return undefined;
  }

  try {
    const parsedUrl = new URL(trimmedLink);
    const pathSegments = parsedUrl.pathname.split('/').filter(Boolean);
    const developmentToken = getDevelopmentInviteToken(parsedUrl);

    if (developmentToken) {
      return developmentToken;
    }

    if (isProductionInviteHost(parsedUrl.hostname) && pathSegments[0] === 'join') {
      return decodeInviteToken(pathSegments[1]);
    }
  } catch {
    return undefined;
  }

  return undefined;
}
