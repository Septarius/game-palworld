import { types } from 'vortex-api';

import { PakModType } from './common';

export type LoadOrder = ILoadOrderEntry[];
export type EventType = 'did-deploy' | 'gamemode-activated';

export interface IPakFileInfo {
  fileName: string;
  offset: number;
  size: number;
  sha1: string;
  compression: string;
}

export interface IPakExtractionInfo {
  mountPoint: string;
  files: IPakFileInfo[];
  modType: PakModType | null;
}

export interface IGithubDownload {
  fileName: string;
  url: string;
}

export type PluginRequirements = { [storeId: string]: IPluginRequirement[] }
export interface IPluginRequirement {
  fileName: string;
  modType: string;
  modId?: number;
  userFacingName?: string;
  githubUrl?: string;
  modUrl?: string;
  findMod: (api: types.IExtensionApi) => Promise<types.IMod>;
  findDownloadId: (api: types.IExtensionApi) => string;
  fileFilter?: (file: string) => boolean;
}

export interface ISerializableData {
  // The prefix we want to add to the folder name on deployment.
  prefix: string;
}

export interface ILoadOrderEntry {
  // An arbitrary unique Id.
  id: string;

  // This property is required by the FBLO API functions.
  // This game will not be using checkboxes so we're just going to
  // assign "true" when we build the load order entry instance.
  enabled: boolean;

  // Human readable name for the mod - this is what we display to the user
  // in the load order page.
  name: string;

  // The modId as stored by Vortex in its application state. Remember, in
  //  other games, 1 modId could have several mod entries in the load order
  //  page that are tied to it. That's why we have two separate id properties.
  modId?: string;

  // Any additional data we want to store in the load order file.
  data?: ISerializableData;
}
