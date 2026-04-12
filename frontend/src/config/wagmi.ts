import { http, createConfig } from 'wagmi'
import { bsc, mainnet, base } from 'wagmi/chains'
import { injected, walletConnect } from '@wagmi/connectors'

export const wagmiConfig = createConfig({
  chains: [bsc, mainnet, base],
  connectors: [
    injected(),
  ],
  transports: {
    [bsc.id]: http(),
    [mainnet.id]: http(),
    [base.id]: http(),
  },
})
