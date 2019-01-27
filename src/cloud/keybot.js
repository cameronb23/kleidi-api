import {
  createNewCluster, createTaskDefinition, deployService as deployServiceAws, deleteOtherServices, uploadFile
} from './providers/aws';

export const createKeybotService = async (serviceId, serviceName, serviceOwnerId, provider, db) => {
  switch (provider) {
    case 'AWS': {
      try {
        const clusterArn = await createNewCluster(serviceId, serviceName, serviceOwnerId);

        await db.mutation.updateKeybotService({
          where: {
            id: serviceId
          },
          data: {
            cloudResourceId: clusterArn,
            currentOperation: 'IDLE',
            currentOperationStatus: 'Successfully created cloud service. Ready to deploy'
          }
        }, '{ id }');
      } catch (e) {
        console.error(e);
        await db.mutation.updateKeybotService({
          where: {
            id: serviceId
          },
          data: {
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

export const deployService = async (service, credentials, db) => {
  console.log(service);
  switch (service.cloudProvider) {
    case 'AWS': {
      try {
        // bring down any other running service
        await deleteOtherServices(service);
        const defArn = await createTaskDefinition(service, credentials);
        console.log('Task definition ARN: ', defArn);
        const serviceArn = await deployServiceAws(service);
        console.log('Service ARN: ', serviceArn);

        await db.mutation.updateKeybotService({
          where: {
            id: service.id
          },
          data: {
            currentOperation: 'RUNNING',
            currentOperationStatus: 'Successfully deployed to the cloud'
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

export const uploadCustomResource = async (serviceId, provider, filePath, fileStream) => {
  switch (provider) {
    case 'AWS': {
      try {
        const resLocation = await uploadFile(serviceId, filePath, fileStream);
        return resLocation;
      } catch (e) {
        console.error('Error uploading file', e);
        throw new Error(e);
      }
    }
    default: {
      return console.error('none');
    }
  }
};
