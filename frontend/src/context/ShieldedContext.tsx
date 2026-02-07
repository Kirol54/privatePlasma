/**
 * Shielded wallet context.
 *
 * Manages the BrowserShieldedWallet, BrowserPoolClient, and Merkle tree state.
 * Persists the shielded wallet to localStorage.
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { BrowserShieldedWallet, BrowserPoolClient, type TxProgress } from '../lib/pool-client';
import { bytesToHex } from '../lib/browser-crypto';
import { useWallet } from './WalletContext';
import { config } from '../config';
import type { NoteWithIndex } from '../../../client/src/types.js';

const STORAGE_KEY = 'shielded-pool-wallet';

interface ShieldedState {
  shieldedWallet: BrowserShieldedWallet | null;
  poolClient: BrowserPoolClient | null;
  shieldedBalance: bigint;
  publicBalance: bigint;
  tokenSymbol: string;
  tokenDecimals: number;
  notes: NoteWithIndex[];
  treeLeaves: number;
  isSyncing: boolean;
  syncMessage: string;
  txProgress: TxProgress | null;
  // Actions
  initWallet: () => void;
  importWallet: (spendingKeyHex: string) => void;
  resetWallet: () => void;
  sync: () => Promise<void>;
  deposit: (amount: bigint) => Promise<void>;
  privateTransfer: (recipientPubkeyHex: string, amount: bigint, recipientViewingPubkeyHex: string) => Promise<void>;
  withdraw: (amount: bigint, recipient: string) => Promise<void>;
  clearTxProgress: () => void;
}

const ShieldedContext = createContext<ShieldedState>({
  shieldedWallet: null,
  poolClient: null,
  shieldedBalance: 0n,
  publicBalance: 0n,
  tokenSymbol: 'USDT',
  tokenDecimals: 6,
  notes: [],
  treeLeaves: 0,
  isSyncing: false,
  syncMessage: '',
  txProgress: null,
  initWallet: () => {},
  importWallet: () => {},
  resetWallet: () => {},
  sync: async () => {},
  deposit: async () => {},
  privateTransfer: async () => {},
  withdraw: async () => {},
  clearTxProgress: () => {},
});

export function ShieldedProvider({ children }: { children: React.ReactNode }) {
  const { signer, address } = useWallet();

  const [shieldedWallet, setShieldedWallet] = useState<BrowserShieldedWallet | null>(null);
  const [poolClient, setPoolClient] = useState<BrowserPoolClient | null>(null);
  const [shieldedBalance, setShieldedBalance] = useState(0n);
  const [publicBalance, setPublicBalance] = useState(0n);
  const [tokenSymbol, setTokenSymbol] = useState('USDT');
  const [tokenDecimals, setTokenDecimals] = useState(6);
  const [notes, setNotes] = useState<NoteWithIndex[]>([]);
  const [treeLeaves, setTreeLeaves] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');
  const [txProgress, setTxProgress] = useState<TxProgress | null>(null);

  // Use ref to track latest poolClient for async operations
  const poolClientRef = useRef(poolClient);
  poolClientRef.current = poolClient;
  const walletRef = useRef(shieldedWallet);
  walletRef.current = shieldedWallet;

  // Restore wallet from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const wallet = BrowserShieldedWallet.fromJSON(saved);
        setShieldedWallet(wallet);
      } catch (err) {
        console.warn('Failed to restore wallet from localStorage:', err);
      }
    }
  }, []);

  // Save wallet to localStorage on changes
  const saveWallet = useCallback((wallet: BrowserShieldedWallet) => {
    localStorage.setItem(STORAGE_KEY, wallet.toJSON());
  }, []);

  // Create pool client when signer + wallet are available
  useEffect(() => {
    if (signer && shieldedWallet && config.poolAddress && config.tokenAddress) {
      const client = new BrowserPoolClient(shieldedWallet, signer);
      setPoolClient(client);
    } else {
      setPoolClient(null);
    }
  }, [signer, shieldedWallet]);

  // Fetch token info + public balance when pool client changes
  useEffect(() => {
    if (poolClient && address) {
      poolClient.getTokenSymbol().then(setTokenSymbol).catch(() => {});
      poolClient.getTokenDecimals().then(setTokenDecimals).catch(() => {});
      poolClient.getPublicBalance(address).then(setPublicBalance).catch(() => {});
    }
  }, [poolClient, address]);

  // Update derived state from wallet
  const updateState = useCallback(() => {
    const w = walletRef.current;
    const p = poolClientRef.current;
    if (w) {
      setShieldedBalance(w.getBalance());
      setNotes(w.getAllNotes());
      if (w) saveWallet(w);
    }
    if (p) {
      setTreeLeaves(p.tree.nextIndex);
    }
  }, [saveWallet]);

  const initWallet = useCallback(() => {
    const wallet = new BrowserShieldedWallet();
    setShieldedWallet(wallet);
    saveWallet(wallet);
  }, [saveWallet]);

  const importWallet = useCallback((spendingKeyHex: string) => {
    const clean = spendingKeyHex.startsWith('0x') ? spendingKeyHex.slice(2) : spendingKeyHex;
    const bytes = new Uint8Array(clean.length / 2);
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(clean.substring(i * 2, i * 2 + 2), 16);
    }
    const wallet = new BrowserShieldedWallet(bytes);
    setShieldedWallet(wallet);
    saveWallet(wallet);
  }, [saveWallet]);

  const resetWallet = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setShieldedWallet(null);
    setPoolClient(null);
    setShieldedBalance(0n);
    setNotes([]);
    setTreeLeaves(0);
  }, []);

  const sync = useCallback(async () => {
    const client = poolClientRef.current;
    if (!client || !address) return;

    setIsSyncing(true);
    try {
      await client.sync((msg) => setSyncMessage(msg));
      // Refresh public balance
      const bal = await client.getPublicBalance(address);
      setPublicBalance(bal);
      updateState();
      setSyncMessage('Sync complete');
    } catch (err: any) {
      setSyncMessage(`Sync failed: ${err.message}`);
    } finally {
      setIsSyncing(false);
    }
  }, [address, updateState]);

  const deposit = useCallback(async (amount: bigint) => {
    const client = poolClientRef.current;
    if (!client || !address) throw new Error('Not connected');

    await client.deposit(amount, setTxProgress);
    // Refresh balances
    const bal = await client.getPublicBalance(address);
    setPublicBalance(bal);
    updateState();
  }, [address, updateState]);

  const privateTransfer = useCallback(async (recipientPubkeyHex: string, amount: bigint, recipientViewingPubkeyHex: string) => {
    const client = poolClientRef.current;
    if (!client) throw new Error('Not connected');

    const parseHex = (hex: string) => {
      const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
      const bytes = new Uint8Array(clean.length / 2);
      for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(clean.substring(i * 2, i * 2 + 2), 16);
      }
      return bytes;
    };

    const pubkey = parseHex(recipientPubkeyHex);
    const viewingPubkey = parseHex(recipientViewingPubkeyHex);

    await client.privateTransfer(pubkey, amount, viewingPubkey, setTxProgress);
    updateState();
  }, [updateState]);

  const withdraw = useCallback(async (amount: bigint, recipient: string) => {
    const client = poolClientRef.current;
    if (!client || !address) throw new Error('Not connected');

    await client.withdraw(amount, recipient, setTxProgress);
    const bal = await client.getPublicBalance(address);
    setPublicBalance(bal);
    updateState();
  }, [address, updateState]);

  const clearTxProgress = useCallback(() => {
    setTxProgress(null);
  }, []);

  return (
    <ShieldedContext.Provider
      value={{
        shieldedWallet,
        poolClient,
        shieldedBalance,
        publicBalance,
        tokenSymbol,
        tokenDecimals,
        notes,
        treeLeaves,
        isSyncing,
        syncMessage,
        txProgress,
        initWallet,
        importWallet,
        resetWallet,
        sync,
        deposit,
        privateTransfer,
        withdraw,
        clearTxProgress,
      }}
    >
      {children}
    </ShieldedContext.Provider>
  );
}

export function useShielded() {
  return useContext(ShieldedContext);
}
