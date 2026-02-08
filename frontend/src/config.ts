export const config = {
  rpcUrl: import.meta.env.VITE_RPC_URL || 'https://testnet-rpc.plasma.to',
  poolAddress: import.meta.env.VITE_POOL_ADDRESS || '',
  tokenAddress: import.meta.env.VITE_TOKEN_ADDRESS || '',
  proxyUrl: import.meta.env.VITE_PROXY_URL ||
    (typeof window !== 'undefined' && window.location.protocol === 'https:'
      ? 'https://localhost:3443'
      : 'http://localhost:3001'),
  deployBlock: Number(import.meta.env.VITE_DEPLOY_BLOCK || '0'),
  treeLevels: Number(import.meta.env.VITE_TREE_LEVELS || '20'),
  // Plasma testnet network details
  chainId: Number(import.meta.env.VITE_CHAIN_ID || '9746'),
  chainName: 'Plasma Testnet',
  chainRpcUrl: import.meta.env.VITE_RPC_URL || 'https://testnet-rpc.plasma.to',
  blockExplorerUrl: 'https://testnet.plasma.to',
  nativeCurrency: {
    name: 'XPL',
    symbol: 'XPL',
    decimals: 18,
  },
} as const;
