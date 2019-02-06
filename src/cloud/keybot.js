import _ from 'underscore';
import uniqid from 'uniqid';
import {
  createTaskDefinition,
  retrieveServiceStatus,
  deployService as deployServiceAws,
  uploadFile,
  getTagsForObject,
  getCustomServiceResources,
  deleteFile
} from './providers/aws';

export const getCurrentKeybotVersion = async () => {
  const latestTags = await getTagsForObject('keybot-prod', 'releases/release.zip');

  let latestVersion = 'Unavailable';

  if (latestTags) {
    latestVersion = _.findWhere(latestTags, { Key: 'VERSION' }).Value;
  }

  return latestVersion;
}

export const createKeybotService = async (serviceId, serviceName, serviceOwnerId, provider, db) => {
  switch (provider) {
    case 'AWS': {
      try {
        await db.mutation.updateKeybotService({
          where: {
            id: serviceId
          },
          data: {
            currentOperation: 'IDLE',
            currentOperationStatus: 'Successfully created cloud service. Add credentials and deploy!'
          }
        }, '{ id }');
      } catch (e) {
        console.error(e);
        await db.mutation.updateKeybotService({
          where: {
            id: serviceId
          },
          data: {
            currentOperation: 'IDLE',
            currentOperationStatus: 'Failed to create cloud service. Please re-create this service.'
          }
        }, '{ id }');
      }
      break;
    }
    case 'HEROKU': {
      console.error('null');
      break;
    }
    default: {
      // only aws rn
      console.error('No cloud provider.');
    }
  }
};

export const pingServiceStatus = async (service, db) => {
  switch (service.cloudProvider) {
    case 'AWS': {
      try {
        if (!service.cloudResourceId) {
          return;
        }
        const res = await retrieveServiceStatus(service, 'arn:aws:ecs:us-east-1:758556097563:cluster/Keybot-Deployment-Cluster');
        const { currentOperation, currentOperationStatus, lastDeploy } = res;
        await db.mutation.updateKeybotService({
          where: {
            id: service.id
          },
          data: {
            currentOperation,
            currentOperationStatus,
            lastDeploy
          }
        }, '{ id }');
      } catch (e) {
        console.error(e);
      }
      break;
    }
    case 'HEROKU': {
      console.error('null');
      break;
    }
    default: {
      console.error('No cloud provider');
    }
  }
};

export const deployService = async (service, credentials, db) => {
  switch (service.cloudProvider) {
    case 'AWS': {
      try {
        const newAccessKey = uniqid();
        const defArn = await createTaskDefinition(service, credentials, newAccessKey);
        console.log('Task definition ARN: ', defArn);
        const serviceArn = await deployServiceAws(service, 'arn:aws:ecs:us-east-1:758556097563:cluster/Keybot-Deployment-Cluster'); // cluster ARN
        console.log('Service ARN: ', serviceArn);
        const latestTags = await getTagsForObject('keybot-prod', 'releases/release.zip');

        let latestVersion = null;

        if (latestTags) {
          latestVersion = _.findWhere(latestTags, { Key: 'VERSION' }).Value;
        }

        await db.mutation.updateKeybotService({
          where: {
            id: service.id
          },
          data: {
            currentVersion: latestVersion,
            cloudResourceId: serviceArn,
            cloudAccessKey: newAccessKey,
            currentOperation: 'DEPLOYING',
            currentOperationStatus: 'Deploying new patch to instances'
          }
        }, '{ id }');
      } catch (e) {
        console.error(e);
        await db.mutation.updateKeybotService({
          where: {
            id: service.id
          },
          data: {
            currentOperation: 'IDLE',
            currentOperationStatus: 'Failed to deploy. Please attempt deploy again later'
          }
        }, '{ id }');
      }
      break;
    }
    case 'HEROKU': {
      console.error('null');
      break;
    }
    default: {
      // only aws rn
      console.error('No cloud provider.');
    }
  }
};

export const fetchCustomResources = async (serviceId, db) => {
  try {
    const json = await getCustomServiceResources(serviceId);

    await db.mutation.updateKeybotService({
      where: {
        id: serviceId
      },
      data: {
        customFiles: json
      }
    });
  } catch (e) {
    console.error('Error fetching files', e);
  }
};

export const deleteCustomResource = async (serviceId, filePath) => {
  try {
    await deleteFile(serviceId, filePath);
    return;
  } catch (e) {
    console.error('Error delete file', e);
    throw new Error(e);
  }
};

export const uploadCustomResource = async (serviceId, provider, opts, fileStream) => {
  try {
    const resLocation = await uploadFile(serviceId, opts, fileStream);
    return resLocation;
  } catch (e) {
    console.error('Error uploading file', e);
    throw new Error(e);
  }
};
