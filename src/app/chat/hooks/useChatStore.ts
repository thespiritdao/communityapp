// src\app\chat\hooks\useChatStore.ts
import { create } from "zustand";

// Define placeholders or actual types here instead of importing from "@/app/data"
interface Message {
  id: number;
  avatar: string;
  name: string;
  role: "user" | "ai";
  message: string;
  isLoading?: boolean;
}

// If you used UserData previously, define a minimal placeholder
interface UserData {
  id: number;
  name: string;
  avatar?: string;
  messages: Message[];
}

// Provide placeholders for ChatBotMessages, userData, and Users
const ChatBotMessages: Message[] = [
  {
    id: 1,
    avatar: "",
    name: "ChatBot",
    role: "ai",
    message: "Hello! How can I help you today?",
  },
];

const userData: UserData[] = [
  {
    id: 1,
    name: "Jane Doe",
    avatar: "https://example.com/avatar.jpg",
    messages: [
      {
        id: 1,
        avatar: "https://example.com/avatar.jpg",
        name: "Jane Doe",
        role: "user",
        message: "Hey!",
      },
    ],
  },
];

const Users: UserData[] = [
  {
    id: 5,
    name: "Jakob Hoeg",
    avatar: "https://example.com/jakob.jpg",
    messages: [
      {
        id: 1,
        avatar: "https://example.com/jakob.jpg",
        name: "Jakob Hoeg",
        role: "user",
        message: "Hello!",
      },
    ],
  },
];

export interface Example {
  name: string;
  url: string;
}

interface State {
  selectedExample: Example;
  examples: Example[];
  input: string;
  chatBotMessages: Message[];
  messages: Message[];
  hasInitialAIResponse: boolean;
  hasInitialResponse: boolean;
}

interface Actions {
  selectedUser: UserData;
  setSelectedExample: (example: Example) => void;
  setExamples: (examples: Example[]) => void;
  setInput: (input: string) => void;
  handleInputChange: (
    e:
      | React.ChangeEvent<HTMLInputElement>
      | React.ChangeEvent<HTMLTextAreaElement>,
  ) => void;
  setchatBotMessages: (fn: (chatBotMessages: Message[]) => Message[]) => void;
  setMessages: (fn: (messages: Message[]) => Message[]) => void;
  setHasInitialAIResponse: (hasInitialAIResponse: boolean) => void;
  setHasInitialResponse: (hasInitialResponse: boolean) => void;
}

const useChatStore = create<State & Actions>()((set) => ({
  selectedUser: Users[0], // or choose a different user if needed

  selectedExample: { name: "Messenger example", url: "/" },

  examples: [
    { name: "Messenger example", url: "/" },
    { name: "Chatbot example", url: "/chatbot" },
    { name: "Chatbot2 example", url: "/chatbot2" },
  ],

  input: "",

  setSelectedExample: (selectedExample) => set({ selectedExample }),

  setExamples: (examples) => set({ examples }),

  setInput: (input) => set({ input }),
  handleInputChange: (
    e:
      | React.ChangeEvent<HTMLInputElement>
      | React.ChangeEvent<HTMLTextAreaElement>,
  ) => set({ input: e.target.value }),

  chatBotMessages: ChatBotMessages,
  setchatBotMessages: (fn) =>
    set(({ chatBotMessages }) => ({ chatBotMessages: fn(chatBotMessages) })),

  messages: userData[0].messages,
  setMessages: (fn) => set(({ messages }) => ({ messages: fn(messages) })),

  hasInitialAIResponse: false,
  setHasInitialAIResponse: (hasInitialAIResponse) =>
    set({ hasInitialAIResponse }),

  hasInitialResponse: false,
  setHasInitialResponse: (hasInitialResponse) => set({ hasInitialResponse }),
}));

export default useChatStore;
