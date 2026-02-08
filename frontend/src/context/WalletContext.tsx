/**
 * MetaMask wallet connection context.
 *
 * Provides the connected address, ethers Signer, and BrowserProvider
 * to all child components.
 */

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { BrowserProvider, type Signer } from 'ethers';
import { config } from '../config';

interface WalletState {
  address: string | null;
  signer: Signer | null;
  provider: BrowserProvider | null;
  chainId: number | null;
  isConnecting: boolean;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
}

const WalletContext = createContext<WalletState>({
  address: null,
  signer: null,
  provider: null,
  chainId: null,
  isConnecting: false,
  error: null,
  connect: async () => {},
  disconnect: () => {},
});

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [signer, setSigner] = useState<Signer | null>(null);
  const [provider, setProvider] = useState<BrowserProvider | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ensureCorrectChain = useCallback(async (ethereum: any): Promise<boolean> => {
    const targetChainHex = '0x' + config.chainId.toString(16);

    try {
      await ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: targetChainHex }],
      });
      return true;
    } catch (switchError: any) {
      // 4902 = chain not added to MetaMask yet
      if (switchError.code === 4902) {
        try {
          await ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: targetChainHex,
              chainName: config.chainName,
              rpcUrls: [config.chainRpcUrl],
              blockExplorerUrls: [config.blockExplorerUrl],
              nativeCurrency: config.nativeCurrency,
            }],
          });
          return true;
        } catch (addError: any) {
          setError(`Failed to add ${config.chainName}: ${addError.message}`);
          return false;
        }
      }
      // User rejected the switch
      if (switchError.code === 4001) {
        setError(`Please switch to ${config.chainName} to use this app.`);
        return false;
      }
      setError(`Failed to switch network: ${switchError.message}`);
      return false;
    }
  }, []);

  const connect = useCallback(async () => {
    const ethereum = (window as any).ethereum;
    if (!ethereum) {
      setError('MetaMask not found. Please install MetaMask.');
      return;
    }

    setIsConnecting(true);
    setError(null);

    try {
      // 1. Request accounts
      await ethereum.request({ method: 'eth_requestAccounts' });

      // 2. Ensure correct chain
      const chainOk = await ensureCorrectChain(ethereum);
      if (!chainOk) {
        setIsConnecting(false);
        return;
      }

      // 3. Create provider + signer after chain switch
      const browserProvider = new BrowserProvider(ethereum);
      const signer = await browserProvider.getSigner();
      const address = await signer.getAddress();
      const network = await browserProvider.getNetwork();

      const currentChainId = Number(network.chainId);
      if (currentChainId !== config.chainId) {
        setError(`Wrong network (chain ${currentChainId}). Please switch to ${config.chainName}.`);
        setIsConnecting(false);
        return;
      }

      setProvider(browserProvider);
      setSigner(signer);
      setAddress(address);
      setChainId(currentChainId);
    } catch (err: any) {
      setError(err.message || 'Failed to connect wallet');
    } finally {
      setIsConnecting(false);
    }
  }, [ensureCorrectChain]);

  const disconnect = useCallback(() => {
    setAddress(null);
    setSigner(null);
    setProvider(null);
    setChainId(null);
  }, []);

  // Listen for account/chain changes
  useEffect(() => {
    const ethereum = (window as any).ethereum;
    if (!ethereum) return;

    const handleAccountsChanged = (accounts: string[]) => {
      if (accounts.length === 0) {
        disconnect();
      } else if (accounts[0] !== address) {
        // Reconnect with new account
        connect();
      }
    };

    const handleChainChanged = (chainIdHex: string) => {
      const newChainId = parseInt(chainIdHex, 16);
      if (newChainId !== config.chainId) {
        // User switched away — disconnect and show error
        disconnect();
        setError(`Switched to wrong network (chain ${newChainId}). Please reconnect to use ${config.chainName}.`);
      } else {
        // Switched back to correct chain — reconnect
        connect();
      }
    };

    ethereum.on('accountsChanged', handleAccountsChanged);
    ethereum.on('chainChanged', handleChainChanged);

    return () => {
      ethereum.removeListener('accountsChanged', handleAccountsChanged);
      ethereum.removeListener('chainChanged', handleChainChanged);
    };
  }, [address, connect, disconnect]);

  return (
    <WalletContext.Provider
      value={{ address, signer, provider, chainId, isConnecting, error, connect, disconnect }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  return useContext(WalletContext);
}
