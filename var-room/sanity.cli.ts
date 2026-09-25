import {defineCliConfig} from 'sanity/cli'

export default defineCliConfig({
  app: {
    organizationId: 'o7aI6GMzu',
    entry: './src/App.tsx',
  },
  deployment: {
    appId: 'o52zsk96ekrcjpml3l5s09vx',
  },
})
