/* eslint-disable */

import path from 'path';
import { actions, fs, log, selectors, types, util } from 'vortex-api';
import axios from 'axios';

import { GAME_ID, NOTIF_ID_REQUIREMENTS } from './common';
import { IPluginRequirement, IGithubDownload } from './types';

export async function download(api: types.IExtensionApi, requirements: IPluginRequirement[], force?: boolean) {
  api.sendNotification({
    id: NOTIF_ID_REQUIREMENTS,
    message: 'Installing Palworld Requirements',
    type: 'activity',
    noDismiss: true,
    allowSuppress: false,
  });

  const batchActions = [];
  const profileId = selectors.lastActiveProfileForGame(api.getState(), GAME_ID);
  try {
    for (const req of requirements) {
      const mod = await req.findMod(api);
      if (force !== true && mod?.id !== undefined) {
        batchActions.push(actions.setModEnabled(profileId, mod.id, true));
        batchActions.push(actions.setModAttribute(GAME_ID, mod.id, 'customFileName', req.userFacingName));
        batchActions.push(actions.setModAttribute(GAME_ID, mod.id, 'description', 'This is a Palworld modding requirement - leave it enabled.'));
        continue;
      }
      if (req?.modId !== undefined) {
        await downloadNexus(api, req);
      } else {
        const dlId = req.findDownloadId(api);
        if (dlId) {
          await installDownload(api, dlId, req.userFacingName);
          continue;
        }
        const asset = await getLatestReleaseDownloadUrl(api, req);
        const tempPath = path.join(util.getVortexPath('temp'), asset.fileName);
        await doDownload(asset.url, tempPath);
        await importAndInstall(api, tempPath, req.userFacingName);
      }
    }
  } catch (err) {
    // Fallback here.
    log('error', 'failed to download requirements', err);
    return;
  } finally {
    if (batchActions.length > 0) {
      util.batchDispatch(api.store, batchActions);
    }
    api.dismissNotification(NOTIF_ID_REQUIREMENTS);
  }
}

async function installDownload(api: types.IExtensionApi, dlId: string, name: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    api.events.emit('start-install-download', dlId, true, (err, modId) => {
      if (err !== null) {
        api.showErrorNotification('Failed to install requirement', err, { allowReport: false });
        return reject(err);
      }

      const state = api.getState();
      const profileId = selectors.lastActiveProfileForGame(state, GAME_ID);
      const batch = [
        actions.setModAttributes(GAME_ID, modId, {
          installTime: new Date(),
          name,
        }),
        actions.setModEnabled(profileId, modId, true),
      ];
      util.batchDispatch(api.store, batch);
      return resolve();
    })
  })
}

async function importAndInstall(api: types.IExtensionApi, filePath: string, name: string) {
  return new Promise<void>((resolve, reject) => {
    api.events.emit('import-downloads', [filePath], async (dlIds: string[]) => {
      const id = dlIds[0];
      if (id === undefined) {
        return reject(new util.NotFound(filePath));
      }
      try {
        await installDownload(api, id, name);
        return resolve();
      } catch (err) {
        return reject(err);
      }
    });
  })
}

async function downloadNexus(api: types.IExtensionApi, requirement: IPluginRequirement) {
  if (api.ext?.ensureLoggedIn !== undefined) {
    await api.ext.ensureLoggedIn();
  }
  try {
    const modFiles = await api!.ext?.nexusGetModFiles(GAME_ID, requirement!.modId as number);

    const fileTime = (input: any) => Number.parseInt(input.uploaded_time, 10);
    const file = modFiles
      .filter(file => requirement.fileFilter !== undefined ? requirement.fileFilter(file.file_name) : true)
      .filter(file => file.category_id === 1)
      .sort((lhs, rhs) => fileTime(lhs) - fileTime(rhs))[0];

    if (file === undefined) {
      throw new util.ProcessCanceled('File not found');
    }

    const dlInfo = {
      game: GAME_ID,
      name: requirement.fileName,
    };

    const nxmUrl = `nxm://${GAME_ID}/mods/${requirement.modId}/files/${file.file_id}`;
    const dlId = await util.toPromise<string>(cb =>
      api.events.emit('start-download', [nxmUrl], dlInfo, undefined, cb, 'never', { allowInstall: false }));
    const modId = await util.toPromise<string>(cb =>
      api.events.emit('start-install-download', dlId, { allowAutoEnable: false }, cb));
    const profileId = selectors.lastActiveProfileForGame(api.getState(), GAME_ID);
    await actions.setModsEnabled(api, profileId, [modId], true, {
      allowAutoDeploy: false,
      installed: true,
    });
  } catch (err) {
    api!.showErrorNotification('Failed to download/install requirement', err);
    util.opn(requirement?.modUrl || requirement.githubUrl).catch(() => null);
  }
}

async function getLatestReleaseDownloadUrl(api: types.IExtensionApi, requirement: IPluginRequirement): Promise<IGithubDownload | null> {
  try {
    const response = await axios.get(`${requirement.githubUrl}/releases/latest`);
    if (response.status === 200) {
      const release = response.data;
      if (release.assets.length > 0) {
        const chosenAsset = release.assets.find((asset: any) => asset.name.includes(requirement.fileName));
        return { fileName: chosenAsset.name, url: chosenAsset.browser_download_url  };
      }
    }
  } catch (error) {
    api!.showErrorNotification(
      'Error fetching the latest release url for {{repName}}',
      error, { allowReport: false, replace: { repName: requirement.fileName } });
  }

  return null;
}

export async function doDownload(downloadUrl: string, destination: string): Promise<void> {
  const response = await axios({
    method: 'get',
    url: downloadUrl,
    responseType: 'arraybuffer',
    headers: {
      "Accept-Encoding": "gzip, deflate",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/107.0.0.0 Safari/537.36"
    },
  });
  await fs.writeFileAsync(destination, Buffer.from(response.data));
}