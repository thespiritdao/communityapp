// src/features/forum/hooks/useForumTemplates.ts
import { useState, useEffect } from 'react';
import { supabase } from 'src/utils/supabaseClient';

export interface ThreadTemplate {
  id: string;
  name: string;
  titleTemplate: string;
  contentTemplate: string;
  placeholders: string[];
}

export function useForumTemplates() {
  const [templates