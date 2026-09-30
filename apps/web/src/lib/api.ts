'use client';

import { WorkLinkClient } from '@worklink/types';

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000/api/v1';

let accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
  if (typeof window !== 'undefined') {
    if (token) sessionStorage.setItem('wl_at', token);
    else sessionStorage.removeItem('wl_at');
  }
}

export function getAccessToken(): string | null {
  if (accessToken) return accessToken;
  if (typeof window !== 'undefined') {
    accessToken = sessionStorage.getItem('wl_at');
  }
  return accessToken;
}

export const api = new WorkLinkClient(BASE_URL, getAccessToken);
export { BASE_URL };
