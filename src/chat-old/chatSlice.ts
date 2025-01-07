// src/chat/ChatSlice.ts


import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { ChatState, ChatMessage } from './types';
import { fetchMessagesFromAPI, sendMessageToAPI, reactToMessageAPI, editMessageAPI } from './chatApi';

const initialState: ChatState = {
  messages: [],
  isLoading: false,
  error: null,
};

export const fetchMessages = createAsyncThunk(
  'chat/fetchMessages',
  async ({ communityId }: { communityId?: string }) => {
    const response = await fetchMessagesFromAPI(communityId);
    return response;
  }
);


export const sendMessage = createAsyncThunk(
  'chat/sendMessage',
  async ({ content, attachments }: { content: string; attachments?: File[] }) => {
    const response = await sendMessageToAPI(content, attachments);
    return response;
  }
);

export const reactToMessage = createAsyncThunk(
  'chat/reactToMessage',
  async ({ messageId, emoji }: { messageId: string; emoji: string }) => {
    const response = await reactToMessageAPI(messageId, emoji);
    return response;
  }
);

export const editMessage = createAsyncThunk(
  'chat/editMessage',
  async ({ messageId, newContent }: { messageId: string; newContent: string }) => {
    const response = await editMessageAPI(messageId, newContent);
    return response;
  }
);

const chatSlice = createSlice({
  name: 'chat',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchMessages.pending, (state) => {
        state.isLoading = true;
      })
      .addCase(fetchMessages.fulfilled, (state, action) => {
        state.isLoading = false;
        state.messages = action.payload;
      })
      .addCase(fetchMessages.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.error.message || null;
      })
      .addCase(sendMessage.fulfilled, (state, action) => {
        state.messages.push(action.payload);
      })
      .addCase(reactToMessage.fulfilled, (state, action) => {
        const { messageId, emoji, userId } = action.payload;
        const message = state.messages.find(m => m.id === messageId);
        if (message) {
          if (!message.reactions) {
            message.reactions = {};
          }
          if (!message.reactions[emoji]) {
            message.reactions[emoji] = [];
          }
          if (!message.reactions[emoji].includes(userId)) {
            message.reactions[emoji].push(userId);
          }
        }
      })
      .addCase(editMessage.fulfilled, (state, action) => {
        const { messageId, newContent } = action.payload;
        const message = state.messages.find(m => m.id === messageId);
        if (message) {
          message.content = newContent;
        }
      });
  },
});

export default chatSlice.reducer;