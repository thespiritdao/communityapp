import React, { createContext, useContext, useReducer, useEffect } from 'react';
import { useBountyContract } from '../hooks/useBountyContract';
import { useBounty } from '../hooks/useBounty';
import type { Bounty, BountyNotification } from '../components/BountyList';

interface BountyState {
  bounties: Bounty[];
  notifications: BountyNotification[];
  isTokenHolder: boolean;
  loading: boolean;
  error: string | null;
}

type BountyAction =
  | { type: 'SET_BOUNTIES'; payload: Bounty[] }
  | { type: 'ADD_BOUNTY'; payload: Bounty }
  | { type: 'UPDATE_BOUNTY'; payload: Bounty }
  | { type: 'ADD_NOTIFICATION'; payload: BountyNotification }
  | { type: 'SET_TOKEN_HOLDER'; payload: boolean }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null };

const initialState: BountyState = {
  bounties: [],
  notifications: [],
  isTokenHolder: false,
  loading: false,
  error: null,
};

const bountyReducer = (state: BountyState, action: BountyAction): BountyState => {
  switch (action.type) {
    case 'SET_BOUNTIES':
      return { ...state, bounties: action.payload };
    case 'ADD_BOUNTY':
      return { ...state, bounties: [...state.bounties, action.payload] };
    case 'UPDATE_BOUNTY':
      return {
        ...state,
        bounties: state.bounties.map((b) =>
          b.id === action.payload.id ? action.payload : b
        ),
      };
    case 'ADD_NOTIFICATION':
      return {
        ...state,
        notifications: [...state.notifications, action.payload],
      };
    case 'SET_TOKEN_HOLDER':
      return { ...state, isTokenHolder: action.payload };
    case 'SET_LOADING':
      return { ...state, loading: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload };
    default:
      return state;
  }
};

interface BountyContextType extends BountyState {
  createBounty: (bountyData: Omit<Bounty, 'id' | 'createdAt'>) => Promise<void>;
  placeBid: (bountyId: string) => Promise<void>;
  completeBounty: (bountyId: string) => Promise<void>;
}

const BountyContext = createContext<BountyContextType | undefined>(undefined);

export const BountyProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [state, dispatch] = useReducer(bountyReducer, initialState);
  const { createBountyOnChain, placeBidOnChain, approveCompletionOnChain } =
    useBountyContract();
  const { createBounty, placeBid, completeBounty } = useBounty();

  const handleCreateBounty = async (
    bountyData: Omit<Bounty, 'id' | 'createdAt'>
  ) => {
    try {
      dispatch({ type: 'SET_LOADING', payload: true });
      await createBountyOnChain(
        bountyData.title,
        bountyData.description,
        bountyData.category,
        bountyData.value.amount,
        bountyData.value.token,
        [] // TODO: Add reviewers
      );
      await createBounty(bountyData);
      dispatch({ type: 'SET_ERROR', payload: null });
    } catch (error) {
      dispatch({
        type: 'SET_ERROR',
        payload: error instanceof Error ? error.message : 'Failed to create bounty',
      });
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  };

  const handlePlaceBid = async (bountyId: string) => {
    try {
      dispatch({ type: 'SET_LOADING', payload: true });
      await placeBidOnChain(parseInt(bountyId));
      await placeBid(bountyId);
      dispatch({ type: 'SET_ERROR', payload: null });
    } catch (error) {
      dispatch({
        type: 'SET_ERROR',
        payload: error instanceof Error ? error.message : 'Failed to place bid',
      });
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  };

  const handleCompleteBounty = async (bountyId: string) => {
    try {
      dispatch({ type: 'SET_LOADING', payload: true });
      await approveCompletionOnChain(parseInt(bountyId));
      await completeBounty(bountyId);
      dispatch({ type: 'SET_ERROR', payload: null });
    } catch (error) {
      dispatch({
        type: 'SET_ERROR',
        payload: error instanceof Error ? error.message : 'Failed to complete bounty',
      });
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  };

  return (
    <BountyContext.Provider
      value={{
        ...state,
        createBounty: handleCreateBounty,
        placeBid: handlePlaceBid,
        completeBounty: handleCompleteBounty,
      }}
    >
      {children}
    </BountyContext.Provider>
  );
};

export const useBountyContext = () => {
  const context = useContext(BountyContext);
  if (context === undefined) {
    throw new Error('useBountyContext must be used within a BountyProvider');
  }
  return context;
}; 