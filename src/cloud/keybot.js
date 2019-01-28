import {
  createTaskDefinition,
  retrieveServiceStatus,
  deployService as deployServiceAws,
  uploadFile
} from './providers/aws';

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
}

export const deployService = async (service, credentials, db) => {
  switch (service.cloudProvider) {
    case 'AWS': {
      try {
        const defArn = await createTaskDefinition(service, credentials);
        console.log('Task definition ARN: ', defArn);
        const serviceArn = await deployServiceAws(service, 'arn:aws:ecs:us-east-1:758556097563:cluster/Keybot-Deployment-Cluster'); // cluster ARN
        console.log('Service ARN: ', serviceArn);

        await db.mutation.updateKeybotService({
          where: {
            id: service.id
          },
          data: {
            cloudResourceId: serviceArn,
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

export const uploadCustomResource = async (serviceId, provider, opts, fileStream) => {
  switch (provider) {
    case 'AWS': {
      try {
        const resLocation = await uploadFile(serviceId, opts, fileStream);
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
