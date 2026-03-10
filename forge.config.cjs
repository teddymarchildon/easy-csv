const { FusesPlugin } = require('@electron-forge/plugin-fuses');
const { FuseV1Options, FuseVersion } = require('@electron/fuses');
const { execSync } = require('child_process');
const path = require('path');

module.exports = {
  outDir: 'forge-out',
  packagerConfig: {
    name: 'Easy CSV',
    asar: true,
    icon: './icon',
    appBundleId: 'com.teddymarchildon.easycsv',
    extendInfo: {
      LSMinimumSystemVersion: '12.0',
      CFBundleDisplayName: 'Easy CSV',
      ITSAppUsesNonExemptEncryption: false,
      CFBundleDocumentTypes: [
        {
          CFBundleTypeName: 'CSV Document',
          CFBundleTypeRole: 'Editor',
          LSHandlerRank: 'Owner',
          LSItemContentTypes: ['public.comma-separated-values-text'],
        },
        {
          CFBundleTypeName: 'TSV Document',
          CFBundleTypeRole: 'Editor',
          LSHandlerRank: 'Owner',
          LSItemContentTypes: ['public.tab-separated-values-text'],
        },
      ],
      UTImportedTypeDeclarations: [
        {
          UTTypeIdentifier: 'public.comma-separated-values-text',
          UTTypeConformsTo: ['public.delimited-values-text', 'public.plain-text'],
          UTTypeDescription: 'Comma-separated values text',
          UTTypeTagSpecification: {
            'public.filename-extension': ['csv'],
            'public.mime-type': ['text/csv'],
          },
        },
        {
          UTTypeIdentifier: 'public.tab-separated-values-text',
          UTTypeConformsTo: ['public.delimited-values-text', 'public.plain-text'],
          UTTypeDescription: 'Tab-separated values text',
          UTTypeTagSpecification: {
            'public.filename-extension': ['tsv', 'tab'],
            'public.mime-type': ['text/tab-separated-values'],
          },
        },
      ],
    },
    osxSign: {
      identity: 'Apple Distribution: Teddy Marchildon (55PJ732NTM)',
      provisioningProfile: path.resolve(__dirname, 'EasyCSVPP.provisionprofile'),
      optionsForFile: (filePath) => {
        const isChildBinary = filePath.includes('.app/');
        return {
          entitlements: path.resolve(
            __dirname,
            isChildBinary ? 'entitlements.mas.child.plist' : 'entitlements.mas.plist',
          ),
        };
      },
    },
    ignore: (filePath) => {
      if (!filePath) return false;
      if (
        filePath.startsWith('/out') ||
        filePath.startsWith('/node_modules') ||
        filePath === '/package.json'
      ) {
        return false;
      }
      return true;
    },
  },
  rebuildConfig: {},
  hooks: {
    generateAssets: async () => {
      execSync('npx electron-vite build', { stdio: 'inherit' });
    },
  },
  makers: [
    {
      name: '@electron-forge/maker-pkg',
      config: {
        identity: '3rd Party Mac Developer Installer: Teddy Marchildon (55PJ732NTM)',
      },
    },
  ],
  plugins: [
    {
      name: '@electron-forge/plugin-auto-unpack-natives',
      config: {},
    },
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: false,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
      [FuseV1Options.GrantFileProtocolExtraPrivileges]: false,
    }),
  ],
};
