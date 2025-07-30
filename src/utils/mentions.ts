// src/utils/mentions.ts
import { supabase } from './supabaseClient';

// Extracts all mentions in the format @[Display](wallet_address) from a message (react-mentions markup)
export function extractMentionedWallets(message: string): string[] {
  const regex = /@\[[^\]]+\]\(([^\)]+)\)/g;
  const wallets = [];
  let match;
  while ((match = regex.exec(message)) !== null) {
    wallets.push(match[1]);
  }
  return Array.from(new Set(wallets));
}

// Enhanced function that extracts both formatted mentions and attempts to resolve plain text mentions
export async function extractMentionedWalletsEnhanced(message: string): Promise<string[]> {
  console.log('Enhanced mention extraction for message:', message);
  
  // First, extract properly formatted mentions
  const formattedWallets = extractMentionedWallets(message);
  console.log('Formatted mentions found:', formattedWallets);
  
  // If we found formatted mentions, return them
  if (formattedWallets.length > 0) {
    return formattedWallets;
  }
  
  // Fallback: extract plain text mentions and try to resolve them
  const plainMentionRegex = /@(\w+)/g;
  const plainMentions = [];
  let match;
  
  while ((match = plainMentionRegex.exec(message)) !== null) {
    plainMentions.push(match[1].toLowerCase());
  }
  console.log('Plain text mentions found:', plainMentions);
  
  if (plainMentions.length === 0) {
    return [];
  }
  
  // Try to resolve plain mentions to wallet addresses
  try {
    const { data: users, error } = await supabase
      .from('user_profiles')
      .select('wallet_address, first_name, last_name')
      .or(plainMentions.map(mention => `first_name.ilike.%${mention}%,last_name.ilike.%${mention}%`).join(','));
      
    if (error) {
      console.error('Error resolving plain mentions:', error);
      return [];
    }
    
    const resolvedWallets = users?.map(user => user.wallet_address) || [];
    console.log('Resolved wallet addresses:', resolvedWallets);
    
    return Array.from(new Set(resolvedWallets));
  } catch (error) {
    console.error('Error in enhanced mention extraction:', error);
    return [];
  }
}

// Optionally, extract display names as well
export function extractMentionedDisplayNames(message: string): string[] {
  const regex = /@\[([^\]]+)\]\([^\)]+\)/g;
  const names = [];
  let match;
  while ((match = regex.exec(message)) !== null) {
    names.push(match[1]);
  }
  return Array.from(new Set(names));
} 