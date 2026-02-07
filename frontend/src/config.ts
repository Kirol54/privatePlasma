export const config = {
  rpcUrl: import.meta.env.VITE_RPC_URL || 'https://rpc.plasma.horse',
  poolAddress: import.meta.env.VITE_POOL_ADDRESS || '',
  tokenAddress: import.meta.env.VITE_TOKEN_ADDRESS || '',
  proxyUrl: import.meta.env.VITE_PROXY_URL || 'http://localhost:3001',
  deployBlock: Number(import.meta.env.VITE_DEPLOY_BLOCK || '0'),
  treeLevels: Number(import.meta.env.VITE_TREE_LEVELS || '20'),
} as const;
