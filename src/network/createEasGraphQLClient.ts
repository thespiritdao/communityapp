import { GraphQLClient } from 'graphql-request';
import type { Chain } from 'viem';
import { getChainEASGraphQLAPI } from 'src/features/identity/utils/easSupportedChains';

export function createEasGraphQLClient(chain: Chain): GraphQLClient {
  const endpoint = getChainEASGraphQLAPI(chain);
  return new GraphQLClient(endpoint);
}
